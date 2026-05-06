package com.smart_bin.device_service.interceptor;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.device_service.service.DeviceSecurityService;
import com.smart_bin.device_service.utils.HardwareSecureResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.Nullable;
import org.springframework.core.MethodParameter;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@RestControllerAdvice
@RequiredArgsConstructor
public class HardwareResponseInterceptor implements ResponseBodyAdvice<Object> {

    private final DeviceSecurityService securityService;
    private final ObjectMapper objectMapper;

    @Override
    public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
        return returnType.hasMethodAnnotation(HardwareSecureResponse.class);
    }

    @Override
    public @Nullable Object beforeBodyWrite(@Nullable Object body, MethodParameter returnType, MediaType selectedContentType, Class<? extends HttpMessageConverter<?>> selectedConverterType, ServerHttpRequest request, ServerHttpResponse response) {

        try {
            String jsonPayload;
            if (body instanceof String) {
                jsonPayload = (String) body;
            } else {
                jsonPayload = objectMapper.writeValueAsString(body);
            }

            String serverSignature = securityService.signResponseWithServerKey(jsonPayload);

            response.getHeaders().add("X-Signature", serverSignature);

            return body;
        }catch (Exception e){
            log.error("Lỗi trong quá trình ký response cho Hardware: ", e);
            return body;
        }
    }
}
