package com.example.confession_game;

import java.net.URI;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class RoomWebSocketHandler extends TextWebSocketHandler {
    private final RoomRealtimeGateway gateway;
    private final Map<String, String> roomBySession = new ConcurrentHashMap<>();

    public RoomWebSocketHandler(RoomRealtimeGateway gateway) {
        this.gateway = gateway;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        URI uri = session.getUri();
        String roomId = uri == null ? null : UriComponentsBuilder.fromUri(uri).build().getQueryParams().getFirst("roomId");
        if (roomId == null || !roomId.matches("\\d{6}")) {
            session.close(CloseStatus.BAD_DATA);
            return;
        }
        roomBySession.put(session.getId(), roomId);
        gateway.register(roomId, session);
        session.sendMessage(new TextMessage("{\"type\":\"connected\"}"));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String roomId = roomBySession.remove(session.getId());
        if (roomId != null) gateway.unregister(roomId, session);
    }
}
