package com.smart_bin.core.logging;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.aspectj.lang.reflect.MethodSignature;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.util.StopWatch;

import java.util.Arrays;

@Aspect
@Component
@Slf4j
@RequiredArgsConstructor
public class LoggingAspect {

    private final HttpServletRequest request;

    // --- POINTCUTS ---

    @Pointcut("within(@org.springframework.web.bind.annotation.RestController *)")
    public void controllerBean() {}

    @Pointcut("within(@org.springframework.stereotype.Service *)")
    public void serviceBean() {}

    @Pointcut("within(@org.springframework.stereotype.Repository *)")
    public void repositoryBean() {}

    @Pointcut("!within(org.springdoc..*) && !within(software.amazon.awssdk..*)")
    public void frameworkExclusions() {}

    // --- ADVICES ---

    /**
     * Controller Advice:
     * Acts as the "Gatekeeper". It logs the start and the final outcome (Success or Failure).
     * On Failure: Logs a WARN summary (no stack trace) and rethrows to @ControllerAdvice.
     */
    @Around("controllerBean() && frameworkExclusions()")
    public Object logControllerAround(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        String className = signature.getDeclaringType().getSimpleName();
        String methodName = signature.getName();

        String httpMethod = request.getMethod();
        String requestUri = request.getRequestURI();

        final StopWatch stopWatch = new StopWatch();

        // Java 21: try-with-resources for auto-cleaning MDC
        try (
                var c = MDC.putCloseable("className", className);
                var m = MDC.putCloseable("methodName", methodName)
        ) {
            log.info("Enter: {} {} -> {}.{}() with args = {}", httpMethod, requestUri, className, methodName, safeArgs(joinPoint.getArgs()));

            stopWatch.start();
            Object result;

            try {
                result = joinPoint.proceed();
            } catch (Throwable e) {
                stopWatch.stop();
                // STRATEGY: Log only a summary. The full stack trace belongs in GlobalExceptionHandler.
                log.warn("Exit (Failed): {} {} -> {}.{}(). Execution time = {} ms. Error: {}",
                        httpMethod, requestUri, className, methodName,
                        stopWatch.getTotalTimeMillis(), e.getMessage());

                throw e; // Vital: Bubble up to GlobalExceptionHandler
            }

            stopWatch.stop();
            log.info("Exit (Success): {}.{}() with result = {}. Execution time = {} ms.",
                    className, methodName, result, stopWatch.getTotalTimeMillis());

            return result;
        }
    }

    /**
     * Service & Repository Advice:
     * "Silent Bubble Up" Strategy.
     * If an exception occurs, we exit immediately without logging.
     * We rely on the upper layers to report the failure.
     */
    @Around("(serviceBean() || repositoryBean()) && frameworkExclusions()")
    public Object logServiceRepoAround(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        String className = signature.getDeclaringType().getSimpleName();
        String methodName = signature.getName();

        final StopWatch stopWatch = new StopWatch();

        try (
                var c = MDC.putCloseable("className", className);
                var m = MDC.putCloseable("methodName", methodName)
        ) {
            log.info("Enter: {}.{}() with args = {}",
                    className, methodName, safeArgs(joinPoint.getArgs()));

            stopWatch.start();

            // EXECUTE
            // If this throws, we exit this method immediately.
            // No catch block = No duplicate log.
            Object result = joinPoint.proceed();

            stopWatch.stop();

            // Only reached on success
            log.info("Exit: {}.{}() with result = {}. Execution time = {} ms.",
                    className, methodName, result, stopWatch.getTotalTimeMillis());

            return result;
        }
    }

    /**
     * Simple utility to safely print arguments.
     * In a real system, expand this to mask PII (passwords, emails).
     */
    private String safeArgs(Object[] args) {
        if (args == null || args.length == 0) {
            return "[]";
        }
        return Arrays.toString(args);
    }
}