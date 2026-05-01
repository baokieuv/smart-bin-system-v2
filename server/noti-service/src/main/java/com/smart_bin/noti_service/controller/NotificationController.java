package com.smart_bin.noti_service.controller;

import com.smart_bin.core.dto.ApiResponseFormat;
import com.smart_bin.core.utils.ResponseFactory;
import com.smart_bin.noti_service.common.SuccessCode;
import com.smart_bin.noti_service.dto.request.MarkNotiRequest;
import com.smart_bin.noti_service.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final ResponseFactory responseFactory;
    private final NotificationService notificationService;

    @GetMapping
    public ResponseEntity<ApiResponseFormat<Object>> getNotifications(
            @RequestParam Long page,
            @RequestParam Long size,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();

        var response = notificationService.getNotifications(keycloakId, page, size);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @GetMapping("/get-unread-count")
    public ResponseEntity<ApiResponseFormat<Object>> getUnreadCount(
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();

        var response = notificationService.getUnreadCount(keycloakId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/{id}/read")
    public ResponseEntity<ApiResponseFormat<Object>> markAsRead(
            @PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();

        var response = notificationService.markAsRead(keycloakId, id);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/reads")
    public ResponseEntity<ApiResponseFormat<Object>> markAsRead(
            @Valid @RequestBody MarkNotiRequest request,
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();

        var response = notificationService.markNotifications(request, keycloakId);
        return responseFactory.response(SuccessCode.OK, response);
    }

    @PutMapping("/read-all")
    public ResponseEntity<ApiResponseFormat<Object>> readAllNotifications(
            @AuthenticationPrincipal Jwt jwt
    ){
        String keycloakId = jwt.getSubject();

        var response = notificationService.readAllNotification(keycloakId);
        return responseFactory.response(SuccessCode.OK, response);
    }
}
