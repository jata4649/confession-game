package com.example.confession_game.repository;

import java.util.List;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class MessageCardRepository {

    private final JdbcTemplate jdbcTemplate;

    public MessageCardRepository(
            JdbcTemplate jdbcTemplate) {

        this.jdbcTemplate = jdbcTemplate;
    }

    public List<String> findRandomCards(
            int cardCount) {

        String sql = """
                SELECT card_text
                FROM (
                    SELECT card_text
                    FROM message_card
                    WHERE is_active = 1
                    ORDER BY DBMS_RANDOM.VALUE
                )
                WHERE ROWNUM <= ?
                """;

        return jdbcTemplate.query(
                sql,
                (resultSet, rowNumber) ->
                        resultSet.getString("card_text"),
                cardCount
        );
    }
}
