package com.example.confession_game;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** In-memory authoritative game state. Replace with a persistent store for production. */
@Service
public class RoomGameService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final List<String> CARD_POOL = List.of(
            "ずっと言えなかったんだけど、", "君といると、時間が早送りみたいに過ぎていく。",
            "その笑顔を見るたびに、今日が少し好きになる。", "帰り道に、もう少しだけ一緒にいたいと思った。",
            "僕の毎日に、君がいるのが当たり前になってほしい。", "Wi-Fiよりも、君とのつながりを大切にしたい。",
            "うまく言えないけど、本気です。", "次の季節も、隣で笑っていたい。",
            "君のことを考えると、少しだけ勇気が出る。", "これからも、たくさん思い出を増やしたい。",
            "好きです。付き合ってください。", "返事は急がなくていいから、聞いてほしかった。"
    );

    private final Map<String, Room> rooms = new HashMap<>();

    public synchronized Map<String, Object> create(Map<String, Object> request) {
        String name = requiredName(request.get("name"));
        int rounds = boundedNumber(request.get("rounds"), 1, 12, 3);
        int cardCount = boundedNumber(request.get("cardCount"), 3, 8, 5);
        int maxPlayers = boundedNumber(request.get("maxPlayers"), 2, 8, 6);
        String id = roomCode();
        Room room = new Room(id, rounds, cardCount, maxPlayers);
        Player host = room.addPlayer(name, true);
        rooms.put(id, room);
        return Map.of("roomId", id, "playerId", host.id);
    }

    public synchronized Map<String, Object> join(String roomId, Map<String, Object> request) {
        Room room = room(roomId);
        if (room.phase != Phase.WAITING) throw conflict("ゲーム開始後は参加できません。");
        if (room.players.size() >= room.maxPlayers) throw conflict("このルームは満員です。");
        Player player = room.addPlayer(requiredName(request.get("name")), false);
        room.touch();
        return Map.of("roomId", room.id, "playerId", player.id);
    }

    public synchronized Map<String, Object> view(String roomId, String playerId) {
        Room room = room(roomId);
        player(room, playerId).connectedAt = Instant.now();
        return room.toView(playerId);
    }

    public synchronized void start(String roomId, Map<String, Object> request) {
        Room room = room(roomId);
        Player actor = actor(room, request);
        requireHost(actor);
        if (room.players.size() < 2) throw conflict("2人以上で開始できます。");
        if (room.phase != Phase.WAITING) throw conflict("このゲームはすでに始まっています。");
        room.startRound();
    }

    public synchronized void submit(String roomId, Map<String, Object> request) {
        Room room = room(roomId);
        Player actor = actor(room, request);
        if (room.phase != Phase.COMPOSING || actor.id.equals(room.recipientId)) throw conflict("このタイミングでは提出できません。");
        List<String> cards = stringList(request.get("cards"));
        if (cards.isEmpty() || cards.size() > room.cardCount) throw conflict("カードを1〜" + room.cardCount + "枚選んでください。");
        if (!actor.hand.containsAll(cards)) throw conflict("手札にないカードが含まれています。");
        room.confessions.put(actor.id, new ArrayList<>(cards));
        room.touch();
        if (room.confessions.size() == room.players.size() - 1) room.beginReading();
    }

    public synchronized void nextSentence(String roomId, Map<String, Object> request) {
        Room room = room(roomId);
        Player actor = actor(room, request);
        if (room.phase != Phase.READING) throw conflict("現在は読み上げ中ではありません。");
        String readerId = room.readingOrder.get(room.readingIndex);
        if (!actor.id.equals(readerId) && !actor.host) throw forbidden("読み上げ担当者またはホストのみ進行できます。");
        long version = asLong(request.get("version"));
        if (version != room.version) return; // idempotent: stale double taps are ignored
        List<String> lines = room.confessions.get(readerId);
        if (room.sentenceIndex + 1 < lines.size()) {
            room.sentenceIndex++;
        } else if (room.readingIndex + 1 < room.readingOrder.size()) {
            room.readingIndex++;
            room.sentenceIndex = 0;
        } else {
            room.phase = Phase.JUDGING;
        }
        room.touch();
    }

    public synchronized void skipDisconnected(String roomId, Map<String, Object> request) {
        Room room = room(roomId);
        Player actor = actor(room, request);
        requireHost(actor);
        if (room.phase != Phase.COMPOSING) throw conflict("作成フェーズでのみスキップできます。");
        String playerId = String.valueOf(request.get("playerIdToSkip"));
        Player skipped = player(room, playerId);
        if (skipped.id.equals(room.recipientId) || room.confessions.containsKey(skipped.id)) {
            throw conflict("このプレイヤーはスキップできません。");
        }
        if (skipped.connectedAt.isAfter(Instant.now().minusSeconds(12))) {
            throw conflict("接続中のプレイヤーはスキップできません。");
        }
        room.confessions.put(skipped.id, List.of("今回は通信が途切れてしまいました。", "また次の告白で会おうね。"));
        room.touch();
        if (room.confessions.size() == room.players.size() - 1) room.beginReading();
    }

    public synchronized void chooseWinner(String roomId, Map<String, Object> request) {
        Room room = room(roomId);
        Player actor = actor(room, request);
        if (room.phase != Phase.JUDGING || !actor.id.equals(room.recipientId)) throw forbidden("告白される人だけが選べます。");
        String winnerId = String.valueOf(request.get("winnerId"));
        if (!room.confessions.containsKey(winnerId)) throw conflict("選択できないプレイヤーです。");
        room.winnerId = winnerId;
        player(room, winnerId).points++;
        room.phase = Phase.ROUND_RESULT;
        room.touch();
    }

    public synchronized void nextRound(String roomId, Map<String, Object> request) {
        Room room = room(roomId);
        Player actor = actor(room, request);
        requireHost(actor);
        if (room.phase != Phase.ROUND_RESULT) throw conflict("現在は次のラウンドに進めません。");
        if (room.round >= room.totalRounds) {
            room.phase = Phase.GAME_RESULT;
            room.touch();
        } else {
            room.startRound();
        }
    }

    private Room room(String roomId) {
        Room room = rooms.get(roomId.toUpperCase(Locale.ROOT));
        if (room == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "ルームが見つかりません。");
        return room;
    }
    private Player actor(Room room, Map<String, Object> request) { return player(room, String.valueOf(request.get("playerId"))); }
    private Player player(Room room, String id) {
        Player player = room.players.get(id);
        if (player == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "このルームのプレイヤーではありません。");
        return player;
    }
    private static void requireHost(Player player) { if (!player.host) throw forbidden("ホストのみ操作できます。"); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private static ResponseStatusException forbidden(String message) { return new ResponseStatusException(HttpStatus.FORBIDDEN, message); }
    private static String requiredName(Object value) {
        String name = value == null ? "" : value.toString().trim();
        if (name.isBlank() || name.length() > 16) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "名前は1〜16文字で入力してください。");
        return name;
    }
    private static int boundedNumber(Object value, int min, int max, int fallback) {
        try { int number = Integer.parseInt(String.valueOf(value)); return Math.max(min, Math.min(max, number)); }
        catch (Exception ignored) { return fallback; }
    }
    private static long asLong(Object value) { try { return Long.parseLong(String.valueOf(value)); } catch (Exception ignored) { return -1; } }
    private static List<String> stringList(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        return list.stream().filter(String.class::isInstance).map(String.class::cast).toList();
    }
    private String roomCode() { String code; do { code = String.format("%06d", RANDOM.nextInt(1_000_000)); } while (rooms.containsKey(code)); return code; }

    private enum Phase { WAITING, ROUND_START, COMPOSING, READING, JUDGING, ROUND_RESULT, GAME_RESULT }
    private static final class Player {
        final String id = UUID.randomUUID().toString(); final String name; final boolean host; List<String> hand = List.of(); int points; Instant connectedAt = Instant.now();
        Player(String name, boolean host) { this.name = name; this.host = host; }
    }
    private static final class Room {
        final String id; final int totalRounds, cardCount, maxPlayers; final LinkedHashMap<String, Player> players = new LinkedHashMap<>();
        final Map<String, List<String>> confessions = new LinkedHashMap<>(); List<String> readingOrder = List.of();
        int round = 0, recipientCursor = -1, readingIndex = 0, sentenceIndex = 0; long version = 0; Phase phase = Phase.WAITING; String recipientId, winnerId;
        Room(String id, int totalRounds, int cardCount, int maxPlayers) { this.id=id; this.totalRounds=totalRounds; this.cardCount=cardCount; this.maxPlayers=maxPlayers; }
        Player addPlayer(String name, boolean host) { Player p = new Player(name, host); players.put(p.id, p); return p; }
        void startRound() {
            round++; recipientCursor = (recipientCursor + 1) % players.size(); recipientId = new ArrayList<>(players.keySet()).get(recipientCursor);
            confessions.clear(); readingOrder = List.of(); readingIndex = 0; sentenceIndex = 0; winnerId = null;
            for (Player p : players.values()) p.hand = p.id.equals(recipientId) ? List.of() : deal();
            phase = Phase.COMPOSING; touch();
        }
        List<String> deal() {
            List<String> cards = new ArrayList<>(CARD_POOL); java.util.Collections.shuffle(cards); return cards.subList(0, Math.min(cardCount, cards.size()));
        }
        void beginReading() { readingOrder = new ArrayList<>(confessions.keySet()); java.util.Collections.shuffle(readingOrder); readingIndex=0; sentenceIndex=0; phase=Phase.READING; touch(); }
        void touch() { version++; }
        Map<String,Object> toView(String viewerId) {
            Player viewer = players.get(viewerId); boolean isRecipient = viewerId.equals(recipientId); Map<String,Object> result = new HashMap<>();
            result.put("roomId", id); result.put("phase", phase.name()); result.put("version", version); result.put("round", round); result.put("totalRounds", totalRounds); result.put("cardLimit", cardCount); result.put("isHost", viewer.host); result.put("isRecipient", isRecipient); result.put("recipientName", recipientId == null ? null : players.get(recipientId).name); result.put("hand", viewer.hand);
            result.put("players", players.values().stream().map(p -> Map.of("id",p.id,"name",p.name,"host",p.host,"points",p.points,"submitted",confessions.containsKey(p.id),"connected",p.connectedAt.isAfter(Instant.now().minusSeconds(8)),"canSkip",p.connectedAt.isBefore(Instant.now().minusSeconds(12)) && !p.id.equals(recipientId) && !confessions.containsKey(p.id))).toList());
            if (phase == Phase.READING) {
                String reader = readingOrder.get(readingIndex); List<String> lines = confessions.get(reader);
                result.put("readerId", reader); result.put("readerName", players.get(reader).name); result.put("currentSentence", lines.get(sentenceIndex)); result.put("sentenceNumber", sentenceIndex+1); result.put("sentenceTotal", lines.size()); result.put("canAdvance", viewerId.equals(reader) || viewer.host);
            }
            if (phase == Phase.JUDGING || phase == Phase.ROUND_RESULT || phase == Phase.GAME_RESULT) result.put("candidates", confessions.keySet().stream().map(pid -> Map.of("id",pid,"name",players.get(pid).name,"lines",confessions.get(pid))).toList());
            if (winnerId != null) result.put("winnerId", winnerId);
            return result;
        }
    }
}
