package com.example.confession_game;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

/** Broadcasts a small room-change signal; clients then fetch their authorized state via REST. */
@Component
public class RoomRealtimeGateway {
    private final ConcurrentHashMap<String, Set<WebSocketSession>> sessionsByRoom = new ConcurrentHashMap<>();

    public void register(String roomId, WebSocketSession session) {
        sessionsByRoom.computeIfAbsent(roomId, ignored -> ConcurrentHashMap.newKeySet()).add(session);
    }

    public void unregister(String roomId, WebSocketSession session) {
        Set<WebSocketSession> sessions = sessionsByRoom.get(roomId);
        if (sessions == null) return;
        sessions.remove(session);
        if (sessions.isEmpty()) sessionsByRoom.remove(roomId, sessions);
    }

    public void broadcast(String roomId) {
        Set<WebSocketSession> sessions = sessionsByRoom.get(roomId);
        if (sessions == null) return;
        TextMessage message = new TextMessage("{\"type\":\"room-updated\"}");
        sessions.removeIf(session -> {
            if (!session.isOpen()) return true;
            try {
                synchronized (session) { session.sendMessage(message); }
                return false;
            } catch (IOException ignored) {
                return true;
            }
        });
    }
}
