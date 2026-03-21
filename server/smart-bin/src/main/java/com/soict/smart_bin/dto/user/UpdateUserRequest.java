package com.soict.smart_bin.dto.user;

import jakarta.validation.constraints.NotBlank;

public record UpdateUserRequest(
        @NotBlank(message = "First name is required")
        String firstName,

        String lastName
) {
}
