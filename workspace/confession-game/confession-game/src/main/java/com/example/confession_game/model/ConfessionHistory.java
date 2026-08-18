package com.example.confession_game.model;

import java.util.List;

public record ConfessionHistory(
        long historyId,
        String recipientName,
        String openingText,
        String createdAt,
        List<String> sentences) {
}
