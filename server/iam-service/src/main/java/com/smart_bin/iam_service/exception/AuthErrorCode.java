package com.smart_bin.iam_service.exception;

import com.smart_bin.core.exception.ApiResponseCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum AuthErrorCode implements ApiResponseCode {

    UNAUTHORIZED(false, "AVT2001", "error.unauthorized_access", HttpStatus.UNAUTHORIZED),
    FORBIDDEN_ACCESS(false, "AVT2002", "error.forbidden_access", HttpStatus.FORBIDDEN),
    WRONG_CREDENTIALS(false, "AVT2003", "error.wrong_credentials", HttpStatus.UNAUTHORIZED),

    // --- Token Errors ---
    INVALID_TOKEN(false, "AVT2004", "error.invalid_token", HttpStatus.UNAUTHORIZED),
    TOKEN_EXPIRED(false, "AVT2005", "error.token_expired", HttpStatus.UNAUTHORIZED),
    REFRESH_TOKEN_EXPIRED(false, "AVT2006", "error.refresh_token_expired", HttpStatus.UNAUTHORIZED),
    MISSING_TOKEN(false, "AVT2007", "error.missing_token", HttpStatus.UNAUTHORIZED),
    UNVERIFIED_EMAIL(false, "AVT2008", "error.unverified_email", HttpStatus.FORBIDDEN),
    INCOMPLETE_PROFILE(false, "AVT2009", "error.incomplete_profile", HttpStatus.FORBIDDEN),
    ;

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}