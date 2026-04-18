package com.smart_bin.iam_service.utils;

import com.soict.smart_bin.exception.ApiException;
import com.soict.smart_bin.exception.CoreErrorCode;
import com.soict.smart_bin.service.CaptchaService;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CaptchaAspect {

    private final CaptchaService captchaService;

    @Around("@annotation(requireCaptcha")
    public Object validateCaptcha(ProceedingJoinPoint joinPoint, RequireCaptcha requiredCaptcha) throws Throwable {
        String action = requiredCaptcha.action();

        String captchaToken = null;
        for (Object arg : joinPoint.getArgs()){
            if (arg instanceof CaptchaPayload payload){
                captchaToken = payload.getCaptchaToken();
                break;
            }
        }

        boolean isHuman = captchaService.isValidCaptcha(captchaToken, action);
        if (!isHuman){
            throw new ApiException(CoreErrorCode.BAD_REQUEST, "Invalid CAPTCHA or Bot detected");
        }

        return joinPoint.proceed();
    }
}
