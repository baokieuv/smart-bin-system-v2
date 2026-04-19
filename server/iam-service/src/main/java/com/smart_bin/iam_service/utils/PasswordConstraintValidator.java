package com.smart_bin.iam_service.utils;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class PasswordConstraintValidator implements ConstraintValidator<ValidPassword, String> {

    /*
     * Regex giải thích:
     * ^                 : Bắt đầu chuỗi
     * (?=.*[0-9])       : Có ít nhất một chữ số
     * (?=.*[a-z])       : Có ít nhất một chữ cái viết thường
     * (?=.*[A-Z])       : Có ít nhất một chữ cái viết hoa
     * (?=.*[@#$%^&+=!]) : Có ít nhất một ký tự đặc biệt
     * (?=\S+$)          : Không chứa khoảng trắng
     * .{8,}             : Ít nhất 8 ký tự
     * $                 : Kết thúc chuỗi
     */
    private static final String PASSWORD_PATTERN = "^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&+=!])(?=\\S+$).{8,}$";

    @Override
    public boolean isValid(String password, ConstraintValidatorContext context) {
        if (password == null) {
            return false;
        }
        return password.matches(PASSWORD_PATTERN);
    }
}