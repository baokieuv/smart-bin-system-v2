package com.smart_bin.iam_service.exception;

import com.smart_bin.core.exception.ApiResponseCode;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum AuthErrorCode implements ApiResponseCode {

    UNAUTHORIZED(false, "SMB2001", "error.unauthorized_access", HttpStatus.UNAUTHORIZED),
    FORBIDDEN_ACCESS(false, "SMB2002", "error.forbidden_access", HttpStatus.FORBIDDEN),
    WRONG_CREDENTIALS(false, "SMB2003", "error.wrong_credentials", HttpStatus.UNAUTHORIZED),

    // --- Token Errors ---
    INVALID_TOKEN(false, "SMB2004", "error.invalid_token", HttpStatus.UNAUTHORIZED),
    TOKEN_EXPIRED(false, "SMB2005", "error.token_expired", HttpStatus.UNAUTHORIZED),
    REFRESH_TOKEN_EXPIRED(false, "SMB2006", "error.refresh_token_expired", HttpStatus.UNAUTHORIZED),
    MISSING_TOKEN(false, "SMB2007", "error.missing_token", HttpStatus.UNAUTHORIZED),
    UNVERIFIED_EMAIL(false, "SMB2008", "error.unverified_email", HttpStatus.FORBIDDEN),
    INCOMPLETE_PROFILE(false, "SMB2009", "error.incomplete_profile", HttpStatus.FORBIDDEN),

    // 1. Password & Login
    PASSWORD_MUST_BE_DIFFERENT(false, "SMB2010", "error.password_must_be_different", HttpStatus.BAD_REQUEST),
    PASSWORD_MISMATCH(false, "SMB2011", "error.password_mismatch", HttpStatus.BAD_REQUEST),
    CURRENT_PASSWORD_INCORRECT(false, "SMB2012", "error.current_password_incorrect", HttpStatus.BAD_REQUEST),
    TENANT_RESET_PASSWORD_NOT_SUPPORTED(false, "SMB2013", "error.tenant_reset_password_not_supported", HttpStatus.BAD_REQUEST),
    PARTNER_ACCOUNT_BLOCKED(false, "SMB2014", "error.partner_account_blocked", HttpStatus.FORBIDDEN),

    // 2. Identity Provider (Keycloak / Google)
    KEYCLOAK_OPERATION_FAILED(false, "SMB2015", "error.keycloak_operation_failed", HttpStatus.INTERNAL_SERVER_ERROR),
    GOOGLE_AUTH_FAILED(false, "SMB2016", "error.google_auth_failed", HttpStatus.UNAUTHORIZED),

    // 3. Security & Access Control
    CANNOT_CHANGE_OWN_STATUS(false, "SMB2017", "error.cannot_change_own_status", HttpStatus.FORBIDDEN),
    CANNOT_MODIFY_ROOT_ADMIN(false, "SMB2018", "error.cannot_modify_root_admin", HttpStatus.FORBIDDEN),
    USER_NOT_IN_TENANT(false, "SMB2019", "error.user_not_in_tenant", HttpStatus.FORBIDDEN),
    INVALID_INTERNAL_SECRET(false, "SMB2020", "error.invalid_internal_secret", HttpStatus.FORBIDDEN),
    INVALID_PROVISION_SECRET(false, "SMB2021", "error.invalid_provision_secret", HttpStatus.BAD_REQUEST);

    private final boolean success;
    private final String code;
    private final String message;
    private final HttpStatus httpStatus;
}