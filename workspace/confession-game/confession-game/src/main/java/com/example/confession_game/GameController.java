package com.example.confession_game;

import java.util.List;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

import com.example.confession_game.repository.ConfessionHistoryRepository;
import com.example.confession_game.repository.MessageCardRepository;


@Controller
public class GameController {
	private final MessageCardRepository messageCardRepository;
	private final ConfessionHistoryRepository confessionHistoryRepository;

	public GameController(
	        MessageCardRepository messageCardRepository,
	        ConfessionHistoryRepository confessionHistoryRepository) {

	    this.messageCardRepository = messageCardRepository;
	    this.confessionHistoryRepository = confessionHistoryRepository;
	}



    private static final List<String> BASIC_CARDS = List.of(
            "あのさ",
            "〇〇、起きてる？",
            "今、時間いい？"
    );

    

    @GetMapping("/game")
    public String showGame(Model model) {

        List<String> hand =
                messageCardRepository
                    .findRandomCards(7);

        model.addAttribute(
            "basicCards",
            BASIC_CARDS
        );

        model.addAttribute(
            "sentenceCards",
            hand
        );

        return "game";
    }

    @PostMapping("/game/confirm")
    public String confirmMessage(
            @RequestParam("opening")
            String opening,

            @RequestParam(
                    name = "recipientName",
                    defaultValue = "告白相手"
            )
            String recipientName,

            @RequestParam(
                    name = "sentences",
                    required = false
            )
            List<String> sentences,

            Model model) {

        /*
         * 文章カードが選ばれていない場合
         */
        if (sentences == null) {
            sentences = List.of();
        }

        /*
         * 相手の名前を整理
         */
        recipientName = recipientName.trim();

        if (recipientName.isBlank()) {
            recipientName = "告白相手";
        }

        /*
         * Oracleへ履歴を保存
         */
        long historyId =
                confessionHistoryRepository.save(
                        recipientName,
                        opening,
                        sentences
                );

        /*
         * 確認画面へ渡す
         */
        model.addAttribute(
                "historyId",
                historyId
        );

        model.addAttribute(
                "recipientName",
                recipientName
        );

        model.addAttribute(
                "opening",
                opening
        );

        model.addAttribute(
                "sentences",
                sentences
        );

        return "confirm";
    }
    @GetMapping("/history")
    public String showHistory(Model model) {

        model.addAttribute(
                "histories",
                confessionHistoryRepository.findAll()
        );

        return "history";
    }

}
