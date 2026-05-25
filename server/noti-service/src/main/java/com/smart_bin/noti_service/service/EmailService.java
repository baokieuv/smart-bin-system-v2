package com.smart_bin.noti_service.service;

import com.smart_bin.core.exception.ApiException;
import com.smart_bin.noti_service.exception.NotiErrorCode;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.thymeleaf.context.Context;
import org.thymeleaf.spring6.SpringTemplateEngine;

@Service
@RequiredArgsConstructor
public class EmailService {
    private final JavaMailSender mailSender;
    private final SpringTemplateEngine templateEngine;

    @Value("${app.email.from}")
    private String fromEmail;

    @Value("${app.frontend.url}")
    private String frontendUrl;

    public void sendWelcomeEmail(String toEmail, String firstName) {
        Context context = new Context();
        context.setVariable("firstName", firstName);

        String htmlContent = templateEngine.process("welcome-email", context);

        sendHtmlEmail(toEmail, "Welcome to Smart Bin System 🎉", htmlContent);
    }

    public void sendVerificationEmail(String toEmail, String firstName, String token){
        String verifyLink = frontendUrl + "/auth/verify-email?token=" + token + "&email=" + toEmail;

        Context context = new Context();
        context.setVariable("firstName", firstName);
        context.setVariable("verifyLink", verifyLink);

        String htmlContent = templateEngine.process("verification-email", context);
        sendHtmlEmail(toEmail, "Smart Bin - Verify Your Email", htmlContent);
    }

    public void sendPasswordResetEmail(String toEmail, String firstName, String resetToken){
        Context context = new Context();
        context.setVariable("firstName", firstName);
        context.setVariable("resetLink", frontendUrl + "/auth/reset-password?token=" + resetToken + "&email=" + toEmail);

        String htmlContent = templateEngine.process("password-reset-email", context);
        sendHtmlEmail(toEmail, "Smart Bin - Password Reset Request", htmlContent);
    }

    public void sendWelcomeTenantEmail(String toEmail, String firstName, String password) {
        Context context = new Context();

        context.setVariable("firstName", firstName);
        context.setVariable("password", password);

        String htmlContent = templateEngine.process("welcome-tenant-email", context);
        sendHtmlEmail(toEmail, "Welcome to Smart Bin System - Your Account Details", htmlContent);
    }


    private void sendHtmlEmail(String to, String subject, String htmlBody) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);

            mailSender.send(message);
        } catch (MessagingException e) {
            throw new ApiException(NotiErrorCode.EMAIL_SEND_FAILED, "Failed to send email: " + subject);
        }
    }
}