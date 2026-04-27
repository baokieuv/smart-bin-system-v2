package com.smart_bin.order_service.mapper;

import com.smart_bin.order_service.dto.request.CheckoutRequest;
import com.smart_bin.order_service.dto.request.UpdateOrderRequest;
import com.smart_bin.order_service.dto.response.OrderItemResponse;
import com.smart_bin.order_service.dto.response.OrderResponse;
import com.smart_bin.order_service.entity.Order;
import com.smart_bin.order_service.entity.OrderItem;
import org.mapstruct.*;

@Mapper(componentModel = "spring")
public interface OrderMapper {
    // 1. Request -> Entity
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "userId", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "totalAmount", ignore = true)
    @Mapping(target = "shippingFee", ignore = true)
    @Mapping(target = "discountAmount", ignore = true)
    @Mapping(target = "paymentTransactionId", ignore = true)
    @Mapping(target = "items", ignore = true)
    Order toEntity(CheckoutRequest request);

    // 2. Entity -> Response
    @Mapping(target = "status", expression = "java(order.getStatus().name())")
    @Mapping(target = "paymentUrl", source = "paymentUrl")
    OrderResponse toResponse(Order order, String paymentUrl);

    // 3. Tự động map OrderItem -> OrderItemResponse
    OrderItemResponse toOrderItemResponse(OrderItem orderItem);

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "userId", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "items", ignore = true)
    void updateOrderFromRequest(UpdateOrderRequest request, @MappingTarget Order order);
}
