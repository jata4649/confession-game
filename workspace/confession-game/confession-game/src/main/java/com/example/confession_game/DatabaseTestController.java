package com.example.confession_game;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
public class DatabaseTestController {

    private final JdbcTemplate jdbcTemplate;

    public DatabaseTestController(
            JdbcTemplate jdbcTemplate) {

        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/db-test")
    @ResponseBody
    public String testDatabase() {

        String sql =
                "SELECT 'Oracle接続成功' FROM dual";

        return jdbcTemplate.queryForObject(
                sql,
                String.class
        );
    }
}
