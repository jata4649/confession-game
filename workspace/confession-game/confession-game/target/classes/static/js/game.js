document.addEventListener("DOMContentLoaded", function () {

    const cards = document.querySelectorAll(".playing-card");

    const modal = document.getElementById("card-modal");
    const largeCard = document.getElementById("large-card");

    const modalCardType =
        document.getElementById("modal-card-type");

    const modalCardText =
        document.getElementById("modal-card-text");

    const modalCardSymbol =
        document.getElementById("modal-card-symbol");

    const selectCardButton =
        document.getElementById("select-card-button");

    const closeModalElements =
        document.querySelectorAll("[data-close-modal]");

    const messagePreview =
        document.getElementById("message-preview");

    const selectedCount =
        document.getElementById("selected-count");

    const sendButton =
        document.getElementById("send-button");

	const recipientNameInput =
	    document.getElementById("recipient-name");

    let currentCard = null;
    let selectedBasicCard = null;
    let selectedSentenceCards = [];
	let sortableInstance = null;

	/*
	 * 入力された相手の名前を取得
	 */
	function getRecipientName() {

	    const name =
	        recipientNameInput.value.trim();

	    if (name === "") {
	        return "〇〇";
	    }

	    return name;
	}

	/*
	 * カードに表示する文章を取得
	 */
	function getCardDisplayText(card) {

	    const originalText =
	        card.dataset.text;

	    if (card.dataset.kind === "basic") {

	        return originalText
	            .split("〇〇")
	            .join(getRecipientName());
	    }

	    return originalText;
	}
	/*
	 * 名前が変更されたらプレビューを更新
	 */
	recipientNameInput.addEventListener(
	    "input",
	    function () {

	        updateScreen();
	    }
	);


    /*
     * カードをタップしたとき
     */
    cards.forEach(function (card) {

        card.addEventListener("click", function () {
            openModal(card);
        });
    });

    /*
     * 拡大画面を開く
     */
    function openModal(card) {

        currentCard = card;

        const kind = card.dataset.kind;
        const text = getCardDisplayText(card);

        modalCardText.textContent = text;

        if (kind === "basic") {

            modalCardType.textContent = "OPENING";
            modalCardSymbol.textContent = "♡";

            largeCard.classList.add("large-card-basic");
            largeCard.classList.remove("large-card-sentence");

        } else {

            modalCardType.textContent = "MESSAGE";
            modalCardSymbol.textContent = "✦";

            largeCard.classList.add("large-card-sentence");
            largeCard.classList.remove("large-card-basic");
        }

        updateModalButton();

        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");

        document.body.classList.add("modal-open");
    }

    /*
     * 拡大画面を閉じる
     */
    function closeModal() {

        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");

        document.body.classList.remove("modal-open");

        currentCard = null;
    }

    closeModalElements.forEach(function (element) {

        element.addEventListener("click", function () {
            closeModal();
        });
    });

    /*
     * 「このカードを使う」を押したとき
     */
    selectCardButton.addEventListener("click", function () {

        if (currentCard === null) {
            return;
        }

        const kind = currentCard.dataset.kind;

        if (kind === "basic") {
            toggleBasicCard(currentCard);
        } else {
            toggleSentenceCard(currentCard);
        }

        updateScreen();
        closeModal();
    });

    /*
     * 基本カードの選択
     */
    function toggleBasicCard(card) {

        if (selectedBasicCard === card) {

            selectedBasicCard.classList.remove("selected");
            selectedBasicCard = null;

            return;
        }

        if (selectedBasicCard !== null) {
            selectedBasicCard.classList.remove("selected");
        }

        selectedBasicCard = card;
        selectedBasicCard.classList.add("selected");
    }

    /*
     * 文章カードの選択
     */
    function toggleSentenceCard(card) {

        const cardIndex =
            selectedSentenceCards.indexOf(card);

        if (cardIndex >= 0) {

            selectedSentenceCards.splice(cardIndex, 1);
            card.classList.remove("selected");

        } else {

            selectedSentenceCards.push(card);
            card.classList.add("selected");
        }
    }

    /*
     * 拡大画面のボタン表示を変更
     */
    function updateModalButton() {

        if (currentCard === null) {
            return;
        }

        const kind = currentCard.dataset.kind;

        let isSelected = false;

        if (kind === "basic") {

            isSelected =
                selectedBasicCard === currentCard;

        } else {

            isSelected =
                selectedSentenceCards.includes(currentCard);
        }

        if (isSelected) {

            selectCardButton.textContent =
                "このカードを外す";

            selectCardButton.classList.add("remove-mode");

        } else {

            selectCardButton.textContent =
                "このカードを使う";

            selectCardButton.classList.remove("remove-mode");
        }
    }

    /*
     * 画面全体を更新
     */
    function updateScreen() {

        renderPreview();
        updateCount();
        updateSendButton();
    }

	/*
	 * チャットプレビューを表示
	 */
	function renderPreview() {

	    /*
	     * 以前の並べ替え機能を解除する
	     */
	    if (sortableInstance !== null) {

	        sortableInstance.destroy();
	        sortableInstance = null;
	    }

	    messagePreview.innerHTML = "";

	    if (selectedBasicCard === null &&
	        selectedSentenceCards.length === 0) {

	        const emptyMessage =
	            document.createElement("p");

	        emptyMessage.className =
	            "preview-empty";

	        emptyMessage.textContent =
	            "カードを選ぶと、ここに告白文が表示されます";

	        messagePreview.appendChild(
	            emptyMessage
	        );

	        return;
	    }

		    /*
		     * 基本カード
		     */
		    if (selectedBasicCard !== null) {

		        addChatBubble(
				  getCardDisplayText(
					selectedBasicCard
				  )
		        );
		    }

		    /*
		     * 文章カード
		     */
		    selectedSentenceCards.forEach(
		        function (card, index) {

		            addChatBubble(
		                card.dataset.text,
		                index + 1,
		                index
		            );
		        }
		    );

		    /*
		     * 文章カードが2枚以上なら
		     * 長押し並べ替えを有効にする
		     */
		    if (selectedSentenceCards.length >= 2) {
		        enableLongPressSorting();
		    }
		}


	/*
	 * 吹き出しを追加
	 */
	function addChatBubble(text, order, cardIndex) {

	    const wrapper =
	        document.createElement("div");

	    wrapper.className =
	        "preview-message";

	    /*
	     * cardIndexがある場合は文章カード
	     */
	    if (cardIndex !== undefined) {

	        wrapper.classList.add(
	            "sentence-preview-message"
	        );

	        wrapper.dataset.cardIndex =
	            cardIndex;
	    }

	    const bubble =
	        document.createElement("div");

	    bubble.className =
	        "chat-bubble";

	    bubble.textContent =
	        text;

	    wrapper.appendChild(bubble);

	    /*
	     * 文章カードにだけ番号と案内を表示
	     */
	    if (cardIndex !== undefined) {

	        const information =
	            document.createElement("div");

	        information.className =
	            "preview-information";

	        const orderLabel =
	            document.createElement("span");

	        orderLabel.className =
	            "preview-order";

	        orderLabel.textContent =
	            "文章カード " + order;

	        const dragGuide =
	            document.createElement("span");

	        dragGuide.className =
	            "drag-guide";

	        dragGuide.textContent =
	            "長押しで移動";

	        information.appendChild(
	            orderLabel
	        );

	        information.appendChild(
	            dragGuide
	        );

	        wrapper.appendChild(
	            information
	        );
	    }

	    messagePreview.appendChild(
	        wrapper
	    );
	}

	/*
	 * 長押しによる並べ替えを有効にする
	 */
	function enableLongPressSorting() {

	    /*
	     * SortableJSが読み込めなかった場合
	     */
	    if (typeof Sortable === "undefined") {

	        console.error(
	            "SortableJSが読み込まれていません"
	        );

	        return;
	    }

	    sortableInstance =
	        Sortable.create(
	            messagePreview,
	            {
	                /*
	                 * 文章カードだけを移動可能にする
	                 */
	                draggable:
	                    ".sentence-preview-message",

	                /*
	                 * 並べ替え時のアニメーション
	                 */
	                animation: 180,

	                /*
	                 * スマホでは約0.4秒長押し
	                 */
	                delay: 400,
	                delayOnTouchOnly: true,

	                /*
	                 * 指が少し動いただけでは
	                 * 並べ替えを開始しない
	                 */
	                touchStartThreshold: 5,

	                /*
	                 * スマホでのドラッグを安定させる
	                 */
	                forceFallback: true,
	                fallbackTolerance: 5,
	                fallbackOnBody: true,

	                /*
	                 * CSSで使用するクラス
	                 */
	                chosenClass:
	                    "preview-chosen",

	                ghostClass:
	                    "preview-ghost",

	                dragClass:
	                    "preview-dragging",

	                /*
	                 * 長押しが成立したとき
	                 */
	                onChoose: function () {

	                    /*
	                     * 対応スマホなら軽く振動させる
	                     */
	                    if ("vibrate" in navigator) {
	                        navigator.vibrate(30);
	                    }
	                },

	                /*
	                 * 指を離して並べ替えが終了したとき
	                 */
	                onEnd: function () {

	                    const reorderedCards = [];

	                    const messageElements =
	                        messagePreview.querySelectorAll(
	                            ".sentence-preview-message"
	                        );

	                    messageElements.forEach(
	                        function (element) {

	                            const oldIndex =
	                                Number(
	                                    element.dataset.cardIndex
	                                );

	                            const card =
	                                selectedSentenceCards[
	                                    oldIndex
	                                ];

	                            if (card !== undefined) {
	                                reorderedCards.push(card);
	                            }
	                        }
	                    );

	                    selectedSentenceCards =
	                        reorderedCards;

	                    /*
	                     * 新しい順番で画面を再表示する
	                     */
	                    updateScreen();
	                }
	            }
	        );
	}


    /*
     * 選択枚数を表示
     */
    function updateCount() {

        const sentenceCount =
            selectedSentenceCards.length;

        selectedCount.textContent =
            sentenceCount + "枚使用";
    }

    /*
     * 基本カード選択後に送信可能にする
     */
    function updateSendButton() {

        sendButton.disabled =
            selectedBasicCard === null;
    }

    /*
     * Escapeキーで閉じる
     */
    document.addEventListener("keydown", function (event) {

        if (event.key === "Escape" &&
            modal.classList.contains("open")) {

            closeModal();
        }
    });

	sendButton.addEventListener("click", function () {

	    if (selectedBasicCard === null) {
	        return;
	    }

	    const form = document.createElement("form");

	    form.method = "post";
	    form.action = "/game/confirm";

	    const openingInput =
	        document.createElement("input");

	    openingInput.type = "hidden";
	    openingInput.name = "opening";
	    openingInput.value =
	        getCardDisplayText(
				selectedBasicCard
				
			);

	    form.appendChild(openingInput);
		const recipientNameInputForForm =
		    document.createElement("input");

		recipientNameInputForForm.type =
		    "hidden";

		recipientNameInputForForm.name =
		    "recipientName";

		recipientNameInputForForm.value =
		    getRecipientName();

		form.appendChild(
		    recipientNameInputForForm
		);


	    selectedSentenceCards.forEach(function (card) {

	        const sentenceInput =
	            document.createElement("input");

	        sentenceInput.type = "hidden";
	        sentenceInput.name = "sentences";
	        sentenceInput.value = card.dataset.text;

	        form.appendChild(sentenceInput);
	    });

	    document.body.appendChild(form);

	    sendButton.disabled = true;
	    sendButton.textContent = "送信中…";

	    form.submit();
	  });
	});

