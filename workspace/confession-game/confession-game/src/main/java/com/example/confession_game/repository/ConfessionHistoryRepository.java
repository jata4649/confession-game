package com.example.confession_game.repository;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.example.confession_game.model.ConfessionHistory;

@Repository
public class ConfessionHistoryRepository {

    private final JdbcTemplate jdbcTemplate;

    public ConfessionHistoryRepository(
            JdbcTemplate jdbcTemplate) {

        this.jdbcTemplate = jdbcTemplate;
    }

    /*
     * 告白履歴を保存
     */
    @Transactional
    public long save(
            String recipientName,
            String openingText,
            List<String> sentences) {

        Long historyId =
                jdbcTemplate.queryForObject(
                        "SELECT confession_history_seq.NEXTVAL FROM dual",
                        Long.class
                );

        jdbcTemplate.update(
                """
                INSERT INTO confession_history (
                    history_id,
                    recipient_name,
                    opening_text
                ) VALUES (?, ?, ?)
                """,
                historyId,
                recipientName,
                openingText
        );

        for (int index = 0;
                index < sentences.size();
                index++) {

            jdbcTemplate.update(
                    """
                    INSERT INTO confession_history_sentence (
                        history_id,
                        sentence_order,
                        sentence_text
                    ) VALUES (?, ?, ?)
                    """,
                    historyId,
                    index + 1,
                    sentences.get(index)
            );
        }

        return historyId;
    }

    /*
     * 告白履歴を新しい順に取得
     */
    public List<ConfessionHistory> findAll() {

        String historySql = """
                SELECT
                    history_id,
                    recipient_name,
                    opening_text,
                    TO_CHAR(
                        created_at,
                        'YYYY/MM/DD HH24:MI'
                    ) AS created_at_text
                FROM confession_history
                ORDER BY history_id DESC
                """;

        List<ConfessionHistory> histories =
                jdbcTemplate.query(
                        historySql,
                        (resultSet, rowNumber) ->
                                new ConfessionHistory(
                                        resultSet.getLong(
                                                "history_id"
                                        ),
                                        resultSet.getString(
                                                "recipient_name"
                                        ),
                                        resultSet.getString(
                                                "opening_text"
                                        ),
                                        resultSet.getString(
                                                "created_at_text"
                                        ),
                                        List.of()
                                )
                );

        return histories.stream()
                .map(history -> {

                    String sentenceSql = """
                            SELECT sentence_text
                            FROM confession_history_sentence
                            WHERE history_id = ?
                            ORDER BY sentence_order
                            """;

                    List<String> sentences =
                            jdbcTemplate.query(
                                    sentenceSql,
                                    (resultSet, rowNumber) ->
                                            resultSet.getString(
                                                    "sentence_text"
                                            ),
                                    history.historyId()
                            );

                    return new ConfessionHistory(
                            history.historyId(),
                            history.recipientName(),
                            history.openingText(),
                            history.createdAt(),
                            sentences
                    );
                })
                .toList();
    }
}
