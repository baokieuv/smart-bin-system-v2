package com.soict.smart_bin.service;

import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class EmailService {
    private final JavaMailSender mailSender;

    @Value("${app.email.from}")
    private String fromEmail;

    @Value("${app.frontend.url}")
    private String frontendUrl;

    public EmailService(JavaMailSender mailSender){
        this.mailSender = mailSender;
    }

    @Async("emailExecutor")
    public void sendVerificationEmail(String toEmail, String firstName, String token){
        try{
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject("Smart Bin - Verify Your Email");

            String htmlContent = buildVerificationEmailHtml(firstName, token, toEmail);
            helper.setText(htmlContent, true);

            mailSender.send(message);
        }catch (MessagingException ex){
            throw new RuntimeException("Failed to send verification email", ex);
        }
    }

    private String buildVerificationEmailHtml(String firstName, String token, String email){
        String verifyLink = frontendUrl + "/auth/verify-email" + "?token=" + token + "&email=" + email;

        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #374151; background-color: #F3F4F6; margin: 0; padding: 40px 20px; }
                    .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #E5E7EB; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
                    .header { padding: 32px 32px 0 32px; }
                    .header h1 { margin: 0; font-size: 22px; color: #111827; font-weight: 600; }
                    .content { padding: 32px; }
                    .content h2 { font-size: 18px; color: #111827; margin-top: 0; font-weight: 500; }
                    .button { display: inline-block; padding: 12px 28px; background-color: #10B981; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; margin: 24px 0; }
                    .text-muted { color: #6B7280; font-size: 14px; }
                    .link-box { background-color: #F9FAFB; border-radius: 6px; padding: 12px; margin-top: 12px; word-break: break-all; font-size: 13px; color: #10B981; }
                    .footer { padding: 24px 32px; text-align: center; color: #9CA3AF; font-size: 13px; border-top: 1px solid #F3F4F6; background-color: #ffffff; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Smart Bin System</h1>
                    </div>
                    <div class="content">
                        <h2>Hello %s,</h2>
                        <p>Thank you for registering. To complete your setup, please verify your email address by clicking the button below.</p>
                       \s
                        <a href="%s" class="button">Verify Email Address</a>
                       \s
                        <p class="text-muted">If the button doesn't work, copy and paste this link into your browser:</p>
                        <div class="link-box">
                            %s
                        </div>
                       \s
                        <p class="text-muted" style="margin-top: 32px; font-size: 13px;">This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
                    </div>
                    <div class="footer">
                        &copy; 2026 Smart Bin System. All rights reserved.
                    </div>
                </div>
            </body>
            </html>
           \s""".formatted(firstName, verifyLink, verifyLink);
    }

    @Async("emailExecutor")
    public void sendWelcomeEmail(String toEmail, String firstName) {
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject("Welcome to Smart Bin System 🎉");

            String htmlContent = buildWelcomeEmailHtml(firstName);
            helper.setText(htmlContent, true);

            mailSender.send(message);
        } catch (MessagingException e) {
            throw new RuntimeException("Failed to send welcome email", e);
        }
    }

    private String buildWelcomeEmailHtml(String firstName) {
        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #374151; background-color: #F3F4F6; margin: 0; padding: 40px 20px; }
                    .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #E5E7EB; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
                    .header { padding: 32px 32px 0 32px; }
                    .header h1 { margin: 0; font-size: 22px; color: #111827; font-weight: 600; }
                    .content { padding: 32px; }
                    .content h2 { font-size: 18px; color: #111827; margin-top: 0; font-weight: 500; }
                    .feature-list { padding-left: 20px; margin-top: 16px; color: #4B5563; }
                    .feature-list li { margin-bottom: 8px; }
                    .footer { padding: 24px 32px; text-align: center; color: #9CA3AF; font-size: 13px; border-top: 1px solid #F3F4F6; background-color: #ffffff; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Smart Bin System</h1>
                    </div>
                    <div class="content">
                        <h2>Welcome aboard, %s! 🎉</h2>
                        <p>Your email has been successfully verified. We're thrilled to have you join us in building a smarter, cleaner environment.</p>
                       \s
                        <h3 style="font-size: 15px; color: #111827; margin-top: 28px;">Here's what you can do next:</h3>
                        <ul class="feature-list">
                            <li>Add and configure your first smart bin device</li>
                            <li>Monitor waste levels and status in real-time</li>
                            <li>Track recycling and collection statistics</li>
                            <li>Set up automated notifications for full bins</li>
                        </ul>
                       \s
                        <p style="margin-top: 28px; font-size: 14px; color: #6B7280;">If you have any questions or need assistance, our support team is always here to help.</p>
                    </div>
                    <div class="footer">
                        &copy; 2026 Smart Bin System. All rights reserved.
                    </div>
                </div>
            </body>
            </html>
           \s""".formatted(firstName);
    }

    @Async("emailExecutor")
    public void sendPasswordResetEmail(String toEmail, String firstName, String resetToken){
        try{
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");

            helper.setFrom(fromEmail);
            helper.setTo(toEmail);
            helper.setSubject("Smart Bin - Password Reset Request");

            // Truyền resetToken thay vì newPassword
            String htmlContent = buildPasswordResetEmailHtml(firstName, resetToken);
            helper.setText(htmlContent, true);

            mailSender.send(message);
        }catch (MessagingException e){
            throw new RuntimeException("Failed to send password reset email", e);
        }
    }

    private String buildPasswordResetEmailHtml(String firstName, String resetToken) {
        // Tạo link trỏ về Frontend kèm token
        String resetLink = frontendUrl + "/auth/confirm-reset" + "?token=" + resetToken;

        return """
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #374151; background-color: #F3F4F6; margin: 0; padding: 40px 20px; }
                        .container { max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #E5E7EB; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
                        .header { padding: 32px 32px 0 32px; }
                        .header h1 { margin: 0; font-size: 22px; color: #111827; font-weight: 600; }
                        .content { padding: 32px; }
                        .content h2 { font-size: 18px; color: #111827; margin-top: 0; font-weight: 500; }
                        .button { display: inline-block; padding: 12px 28px; background-color: #10B981; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px; margin: 24px 0; }
                        .text-muted { color: #6B7280; font-size: 14px; }
                        .link-box { background-color: #F9FAFB; border-radius: 6px; padding: 12px; margin-top: 12px; word-break: break-all; font-size: 13px; color: #10B981; }
                        .warning-box { border-left: 3px solid #EF4444; padding-left: 16px; margin: 24px 0; font-size: 14px; color: #4B5563; }
                        .warning-title { font-weight: 600; color: #111827; margin-bottom: 8px; display: block; }
                        .footer { padding: 24px 32px; text-align: center; color: #9CA3AF; font-size: 13px; border-top: 1px solid #F3F4F6; background-color: #ffffff; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Smart Bin System</h1>
                        </div>
                        <div class="content">
                            <h2>Hello %s,</h2>
                            <p>We received a request to reset the password for your Smart Bin System account.</p>
                            <p>Click the button below to securely set a new password:</p>
                          \s
                            <a href="%s" class="button">Reset Password</a>
                          \s
                            <p class="text-muted">If the button doesn't work, copy and paste this link into your browser:</p>
                            <div class="link-box">
                                %s
                            </div>
                          \s
                            <div class="warning-box">
                                <span class="warning-title">Security Notice:</span>
                                This link will expire in 15 minutes. If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
                            </div>
                        </div>
                        <div class="footer">
                            &copy; 2026 Smart Bin System. All rights reserved.<br>
                            This is an automated message, please do not reply.
                        </div>
                    </div>
                </body>
                </html>
              \s""".formatted(firstName, resetLink, resetLink);
    }
}