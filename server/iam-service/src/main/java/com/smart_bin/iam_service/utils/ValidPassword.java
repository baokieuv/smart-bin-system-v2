package com.smart_bin.iam_service.utils;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Documented
@Constraint(validatedBy = PasswordConstraintValidator.class) // Trỏ tới class chứa logic validate
@Target({ElementType.FIELD, ElementType.PARAMETER}) // Áp dụng cho các thuộc tính (field)
@Retention(RetentionPolicy.RUNTIME)
public @interface ValidPassword {

    // Message lỗi mặc định nếu password không đạt chuẩn
    String message() default "Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}