package com.example.confession_game;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rooms")
public class RoomApiController {
    private final RoomGameService rooms;

    public RoomApiController(RoomGameService rooms) {
        this.rooms = rooms;
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> request) { return rooms.create(request); }

    @PostMapping("/{roomId}/join")
    public Map<String, Object> join(@PathVariable String roomId, @RequestBody Map<String, Object> request) { return rooms.join(roomId, request); }

    @GetMapping("/{roomId}")
    public Map<String, Object> view(@PathVariable String roomId, @RequestParam String playerId) { return rooms.view(roomId, playerId); }

    @PostMapping("/{roomId}/start")
    public void start(@PathVariable String roomId, @RequestBody Map<String, Object> request) { rooms.start(roomId, request); }

    @PostMapping("/{roomId}/submit")
    public void submit(@PathVariable String roomId, @RequestBody Map<String, Object> request) { rooms.submit(roomId, request); }

    @PostMapping("/{roomId}/next")
    public void next(@PathVariable String roomId, @RequestBody Map<String, Object> request) { rooms.nextSentence(roomId, request); }

    @PostMapping("/{roomId}/skip")
    public void skip(@PathVariable String roomId, @RequestBody Map<String, Object> request) { rooms.skipDisconnected(roomId, request); }

    @PostMapping("/{roomId}/winner")
    public void winner(@PathVariable String roomId, @RequestBody Map<String, Object> request) { rooms.chooseWinner(roomId, request); }

    @PostMapping("/{roomId}/next-round")
    public void nextRound(@PathVariable String roomId, @RequestBody Map<String, Object> request) { rooms.nextRound(roomId, request); }
}
