package com.soict.smart_bin.dto.user;

import com.soict.smart_bin.common.TokenType;
import com.soict.smart_bin.common.UserState;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;

public record UserDto(
        String id,
        String email,
        String firstName,
        String lastName,
        UserState state
) {
}
