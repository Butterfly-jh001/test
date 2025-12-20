document.addEventListener('DOMContentLoaded', function () {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    let pageContent = '';
    let conversationHistory = [];

    // 페이지 컨텐츠 업데이트 함수
    async function updatePageContent() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                if (tabs[0].url.startsWith('chrome://')) {
                    pageContent = "이 페이지의 내용은 보안상의 이유로 접근할 수 없습니다.";
                    console.log("Chrome internal page detected. Cannot access content.");
                    return;
                }

                const response = await chrome.tabs.sendMessage(tabs[0].id, { action: "getPageContent" });
                if (response && response.content) {
                    pageContent = response.content;
                    console.log("Page content updated:", pageContent.substring(0, 100) + "...");
                } else {
                    throw new Error("Failed to get page content");
                }
            }
        } catch (error) {
            console.error('Error updating page content:', error);
            pageContent = "페이지 내용을 가져오는 데 실패했습니다.";
        }
    }

    // 초기 페이지 컨텐츠 업데이트
    updatePageContent();

    // 메시지 추가 함수
    function addMessage(message, isUser) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', isUser ? 'user-message' : 'ai-message');
        if (!isUser && window.MarkdownRenderer) {
            window.MarkdownRenderer.ensureStylesInjected();
            const md = message || "";
            messageElement.setAttribute('data-md-source', md);
            // create inner wrapper to avoid styling root message box
            const wrapper = document.createElement('div');
            wrapper.classList.add('markdown-body');
            messageElement.appendChild(wrapper);
            window.MarkdownRenderer.renderInto(wrapper, md);
        } else {
            messageElement.textContent = message;
        }
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        conversationHistory.push({ role: isUser ? "User" : "Chatbot", message: message });
    }

    // AI 메시지 업데이트 함수
    function updateAIMessage(text) {
        let aiMessage = chatMessages.lastElementChild;
        if (!aiMessage || !aiMessage.classList.contains('ai-message')) {
            aiMessage = document.createElement('div');
            aiMessage.classList.add('message', 'ai-message');
            chatMessages.appendChild(aiMessage);
        }
        if (window.MarkdownRenderer) {
            window.MarkdownRenderer.ensureStylesInjected();
            const md = text || "";
            aiMessage.setAttribute('data-md-source', md);
            let wrapper = aiMessage.querySelector('.markdown-body');
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.classList.add('markdown-body');
                aiMessage.innerHTML = '';
                aiMessage.appendChild(wrapper);
            }
            window.MarkdownRenderer.renderInto(wrapper, md);
        } else {
            aiMessage.textContent = text;
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;

        addCopyButton(aiMessage);
    }

    // 복사 버튼 추가 함수
    function addCopyButton(messageElement) {
        // remove legacy button version if present
        const legacyButton = messageElement.querySelector('button.copy-button');
        if (legacyButton) {
            legacyButton.remove();
        }

        let copyButton = messageElement.querySelector('[data-copy-button]');
        if (!copyButton) {
            copyButton = document.createElement('span');
            copyButton.setAttribute('data-copy-button', 'true');
            copyButton.textContent = '복사';
            copyButton.style.cssText = 'position: absolute; bottom: -20px; right: 10px; cursor: pointer; color: #8b4513;';
            messageElement.appendChild(copyButton);
        }

        copyButton.onclick = () => {
            const targetNode = messageElement.querySelector('.markdown-body') || messageElement;
            const selection = window.getSelection && window.getSelection();
            if (selection) {
                selection.removeAllRanges();
                const range = document.createRange();
                range.selectNodeContents(targetNode);
                selection.addRange(range);
            }

            const textToCopy = targetNode.innerText || targetNode.textContent || '';
            navigator.clipboard.writeText(textToCopy)
                .then(() => console.log('Content copied to clipboard'))
                .catch(err => console.error('Failed to copy: ', err));
        };
    }

    // API 요청 함수
    async function makeAPIRequest(apiConfig, message) {
        const response = await fetch(apiConfig.url, {
            method: 'POST',
            headers: apiConfig.headers,
            body: apiConfig.body(message)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }

        return response;
    }

    // 스트리밍 응답 처리 함수
    async function handleStreamingResponse(response, model, updateCallback) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedResponse = "";
        let buffer = "";
        let hasReceivedData = false;

        console.log(`스트리밍 응답 처리 시작 (모델: ${model})`);

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    // 버퍼에 남은 데이터 처리 시도 (Gemini)
                    if (buffer.trim() && (model.startsWith('gemini') || model === 'gemini20Flash' || model === 'gemini25Flash' || model === 'gemini3Flash')) {
                        try {
                            const finalResult = processGeminiStream(buffer, model, accumulatedResponse, updateCallback);
                            if (finalResult.hasNewData) {
                                accumulatedResponse = finalResult.accumulatedResponse;
                            }
                        } catch (e) {
                            console.warn('버퍼 처리 실패:', e);
                        }
                    }
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // Gemini의 경우 JSON 객체 단위로 파싱 시도
                if (model.startsWith('gemini') || model === 'gemini20Flash' || model === 'gemini25Flash' || model === 'gemini3Flash') {
                    const processResult = processGeminiStream(buffer, model, accumulatedResponse, updateCallback);
                    if (processResult.processed) {
                        buffer = processResult.remainingBuffer;
                        if (processResult.hasNewData) {
                            hasReceivedData = true;
                            accumulatedResponse = processResult.accumulatedResponse;
                        }
                    }
                } else {
                    // 다른 모델들은 기존 방식 사용
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine === '') continue;

                        try {
                            if (model === 'cohere' && trimmedLine.startsWith('event:')) continue;
                            if (model === 'groq' && trimmedLine.startsWith(':')) continue;

                            let jsonLine = trimmedLine.startsWith('data: ') ? trimmedLine.slice(6).trim() : trimmedLine;
                            if (jsonLine === '[DONE]' || jsonLine === '') continue;

                            const parsed = JSON.parse(jsonLine);
                            const content = extractStreamContent(parsed, model);

                            if (content) {
                                hasReceivedData = true;
                                accumulatedResponse += content;
                                updateCallback(accumulatedResponse);
                            }
                        } catch (e) {
                            // 파싱 에러 무시
                        }
                    }
                }
            }
        } catch (error) {
            console.error('스트리밍 응답 처리 중 에러:', error);
            throw error;
        }

        return accumulatedResponse;
    }

    // Gemini 스트리밍 처리 헬퍼 함수 (Robust Parsing)
    function processGeminiStream(buffer, model, currentResponse, updateCallback) {
        let remainingBuffer = buffer;
        let accumulatedResponse = currentResponse;
        let hasNewData = false;
        let processed = false;

        let braceCount = 0;
        let startIdx = -1;
        let jsonStrings = [];
        let inString = false;
        let isEscaped = false;

        for (let i = 0; i < buffer.length; i++) {
            const char = buffer[i];

            if (isEscaped) {
                isEscaped = false;
                continue;
            }

            if (char === '\\') {
                isEscaped = true;
                continue;
            }

            if (char === '"') {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') {
                    if (braceCount === 0) startIdx = i;
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0 && startIdx !== -1) {
                        let jsonStr = buffer.substring(startIdx, i + 1);
                        jsonStrings.push(jsonStr);
                        startIdx = -1;
                    }
                }
            }
        }

        if (jsonStrings.length > 0) {
            processed = true;

            for (const jsonStr of jsonStrings) {
                try {
                    let cleanJson = jsonStr.trim();
                    if (cleanJson.startsWith('data:')) {
                        cleanJson = cleanJson.replace(/^data:\s*/, '').trim();
                    }

                    if (cleanJson === '' || cleanJson === '[DONE]') continue;

                    const parsed = JSON.parse(cleanJson);

                    if (parsed.error) {
                        console.error('Gemini API 에러:', parsed.error);
                        throw new Error(`Gemini API 에러: ${parsed.error.message || JSON.stringify(parsed.error)}`);
                    }

                    const content = extractStreamContent(parsed, model);
                    if (content && content.length > 0) {
                        hasNewData = true;
                        accumulatedResponse += content;
                        updateCallback(accumulatedResponse);
                    }
                } catch (parseError) {
                    if (jsonStrings.indexOf(jsonStr) < 3) {
                        console.warn('JSON 파싱 실패:', parseError.message);
                    }
                }
            }

            if (jsonStrings.length > 0) {
                const lastJson = jsonStrings[jsonStrings.length - 1];
                const lastJsonEnd = buffer.lastIndexOf(lastJson) + lastJson.length;
                remainingBuffer = buffer.substring(lastJsonEnd);
            }
        } else {
            const lines = buffer.split('\n');
            if (lines.length > 1) {
                processed = true;
                remainingBuffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine === '') continue;

                    try {
                        let jsonLine = trimmedLine;
                        if (jsonLine.startsWith('data: ')) {
                            jsonLine = jsonLine.slice(6).trim();
                        }
                        if (jsonLine === '[DONE]' || jsonLine === '') continue;

                        const parsed = JSON.parse(jsonLine);
                        const content = extractStreamContent(parsed, model);
                        if (content && content.length > 0) {
                            hasNewData = true;
                            accumulatedResponse += content;
                            updateCallback(accumulatedResponse);
                        }
                    } catch (e) {
                        // 파싱 에러 무시
                    }
                }
            }
        }

        return {
            processed,
            remainingBuffer,
            accumulatedResponse,
            hasNewData
        };
    }

    // 스트리밍 컨텐츠 추출 함수
    function extractStreamContent(parsed, model) {
        if (model === 'Cerebras') {
            return parsed.choices?.[0]?.delta?.content || '';
        } else if (model === 'mistralSmall') {
            return parsed.choices?.[0]?.delta?.content || '';
        } else if (model.startsWith('gemini') || model === 'gemini20Flash' || model === 'gemini25Flash' || model === 'gemini3Flash') {
            try {
                if (!parsed.candidates || !Array.isArray(parsed.candidates) || parsed.candidates.length === 0) {
                    return '';
                }
                const candidate = parsed.candidates[0];
                if (!candidate.content || !candidate.content.parts) {
                    return '';
                }
                return candidate.content.parts.map(part => part.text || '').join('');
            } catch (error) {
                console.error('extractStreamContent 에러 (Gemini):', error);
                return '';
            }
        } else if (model === 'groq') {
            return parsed.choices?.[0]?.delta?.content || '';
        } else {
            return parsed.event_type === 'text-generation' ? parsed.text : '';
        }
    }

    // 응답 내용 추출 함수 (비스트리밍용 유지)
    function extractResponseContent(parsed) {
        return extractStreamContent(parsed, 'default');
    }

    // 메시지 전송 함수
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        addMessage(message, true);
        userInput.value = '';

        try {
            const config = await getAPIConfig();
            updateAIMessage("답변을 생성 중입니다...");

            const response = await makeAPIRequest(config, message);
            let aiResponse;

            // 응답 헤더 확인
            const contentType = response.headers.get('content-type');
            const isGeminiModel = config.model.startsWith('gemini') || config.model === 'gemini20Flash' || config.model === 'gemini25Flash' || config.model === 'gemini3Flash';
            const isActuallyStreaming = config.isStreaming && (contentType && contentType.includes('text/event-stream') || isGeminiModel);

            if (isActuallyStreaming) {
                aiResponse = await handleStreamingResponse(response, config.model, updateAIMessage);
            } else {
                const data = await response.json();
                aiResponse = extractNonStreamingResponse(data, config.model);
            }

            updateAIMessage(aiResponse);
            conversationHistory.push({ role: "Chatbot", message: aiResponse });
            addModelNameToLastMessage(config.model);
        } catch (error) {
            console.error('Error:', error);
            updateAIMessage(`API 요청 중 오류가 발생했습니다: ${error.message}`);
        }
    }

    // API 설정 가져오기 함수
    async function getAPIConfig() {
        return new Promise((resolve) => {
            chrome.storage.sync.get([
                'cohereApiKey',
                'mistralApiKey',
                'geminiApiKey',
                'geminiflashApiKey',
                'gemini25FlashApiKey',
                'gemini3FlashApiKey',
                'google20FlashApiKey',
                'gemini20FlashModelName',
                'groqApiKey',
                'cerebrasApiKey',
                'cerebrasModel',
                'selectedModel',
                'instructions'
            ], function (result) {
                if (!result.cohereApiKey && !result.mistralApiKey && !result.geminiApiKey &&
                    !result.geminiflashApiKey && !result.gemini25FlashApiKey && !result.gemini3FlashApiKey && !result.google20FlashApiKey && !result.groqApiKey && !result.cerebrasApiKey) {
                    throw new Error("API 키를 설정해주세요.");
                }

                const contextMessage = `현재 웹페이지의 내용: ${pageContent}`;
                const config = {
                    model: result.selectedModel,
                    isStreaming: true,
                    instructions: result.instructions ? result.instructions.join('\n') : ''
                };

                switch (result.selectedModel) {
                    case 'mistralSmall':
                        config.url = 'https://api.mistral.ai/v1/chat/completions';
                        config.headers = {
                            'Authorization': `Bearer ${result.mistralApiKey.trim()}`,
                            'Content-Type': 'application/json'
                        };
                        config.body = (msg) => JSON.stringify({
                            model: "mistral-small-latest",
                            messages: [{ role: "user", content: `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.` }],
                            stream: true
                        });
                        break;
                    case 'groq':
                        config.url = 'https://api.groq.com/openai/v1/chat/completions';
                        config.headers = {
                            'Authorization': `Bearer ${result.groqApiKey.trim()}`,
                            'Content-Type': 'application/json',
                        };
                        config.body = (msg) => JSON.stringify({
                            "messages": [
                                ...conversationHistory.map(hist => ({
                                    role: hist.role.toLowerCase() === "user" ? "user" : "assistant",
                                    content: hist.message
                                })),
                                {
                                    "role": "user",
                                    "content": `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`
                                }
                            ],
                            "model": "llama-3.1-70b-versatile",
                            "temperature": 0.7,
                            "stream": true
                        });
                        break;
                    case 'gemini':
                    case 'geminiflash':
                        const apiKey = result.selectedModel === 'gemini' ? result.geminiApiKey : result.geminiflashApiKey;
                        config.url = `https://generativelanguage.googleapis.com/v1${result.selectedModel === 'geminiflash' ? 'beta' : ''}/models/${result.selectedModel === 'gemini' ? 'gemini-pro' : 'gemini-1.5-flash-latest'}:generateContent?key=${apiKey.trim()}`;
                        config.headers = { 'Content-Type': 'application/json' };
                        config.body = (msg) => JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`
                                }]
                            }],
                            generationConfig: { temperature: 0 }
                        });
                        config.isStreaming = false;
                        break;
                    case 'gemini20Flash': {
                        const gemini20ApiKey = result.google20FlashApiKey;
                        if (!gemini20ApiKey) {
                            throw new Error('Gemini 2.0 Flash API 키가 설정되지 않았습니다.');
                        }
                        const modelName = result.gemini20FlashModelName || 'gemini-2.0-flash';
                        config.url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${gemini20ApiKey.trim()}`;
                        config.headers = {
                            'Content-Type': 'application/json',
                            'x-goog-api-key': gemini20ApiKey.trim()
                        };
                        config.body = (msg) => JSON.stringify({
                            contents: [{
                                role: "user",
                                parts: [{
                                    text: `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`
                                }]
                            }],
                            generationConfig: {
                                temperature: 0.7,
                                topK: 40,
                                topP: 0.95,
                                maxOutputTokens: 8192
                            }
                        });
                        config.isStreaming = true;
                        break;
                    }
                    case 'gemini25Flash': {
                        const gemini25ApiKey = result.gemini25FlashApiKey;
                        if (!gemini25ApiKey) {
                            throw new Error('Gemini 2.5 Flash API 키가 설정되지 않았습니다.');
                        }
                        const modelName = 'gemini-2.5-flash';
                        // Gemini 2.5 Flash 스트리밍 엔드포인트
                        config.url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${gemini25ApiKey.trim()}`;
                        config.headers = {
                            'Content-Type': 'application/json',
                            'x-goog-api-key': gemini25ApiKey.trim()
                        };
                        config.body = (msg) => JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`
                                }]
                            }],
                            generationConfig: {
                                temperature: 0,
                                thinkingConfig: {
                                    thinkingBudget: 0
                                }
                            },
                            safetySettings: [
                                {
                                    category: "HARM_CATEGORY_HATE_SPEECH",
                                    threshold: "BLOCK_NONE"
                                },
                                {
                                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                                    threshold: "BLOCK_NONE"
                                },
                                {
                                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                                    threshold: "BLOCK_NONE"
                                },
                                {
                                    category: "HARM_CATEGORY_HARASSMENT",
                                    threshold: "BLOCK_NONE"
                                }
                            ]
                        });
                        config.isStreaming = true;
                        break;
                    }
                    case 'gemini3Flash': {
                        const gemini3ApiKey = result.gemini3FlashApiKey;
                        if (!gemini3ApiKey) {
                            throw new Error('Gemini 3.0 Flash API 키가 설정되지 않았습니다.');
                        }
                        const modelName = 'gemini-3-flash-preview';
                        // Gemini 3.0 Flash 스트리밍 엔드포인트
                        config.url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${gemini3ApiKey.trim()}`;
                        config.headers = {
                            'Content-Type': 'application/json',
                            'x-goog-api-key': gemini3ApiKey.trim()
                        };
                        config.body = (msg) => JSON.stringify({
                            contents: [{
                                parts: [{
                                    text: `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`
                                }]
                            }],
                            generationConfig: {
                                temperature: 0,
                                thinkingConfig: {
                                    thinkingBudget: 0
                                }
                            },
                            safetySettings: [
                                {
                                    category: "HARM_CATEGORY_HATE_SPEECH",
                                    threshold: "BLOCK_NONE"
                                },
                                {
                                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                                    threshold: "BLOCK_NONE"
                                },
                                {
                                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                                    threshold: "BLOCK_NONE"
                                },
                                {
                                    category: "HARM_CATEGORY_HARASSMENT",
                                    threshold: "BLOCK_NONE"
                                }
                            ]
                        });
                        config.isStreaming = true;
                        break;
                    }
                    case 'Cerebras':
                        if (!result.cerebrasApiKey) {
                            throw new Error("Cerebras API 키가 설정되지 않았습니다.");
                        }

                        config.url = 'https://api.cerebras.ai/v1/chat/completions';
                        config.headers = {
                            'Authorization': `Bearer ${result.cerebrasApiKey}`,
                            'Content-Type': 'application/json'
                        };

                        // 대화 기록 길이 제한
                        const maxHistoryLength = 5; // 최근 5개의 대화만 유지
                        const limitedHistory = conversationHistory.slice(-maxHistoryLength);

                        config.body = (msg) => {
                            // 메시지 길이 체크
                            const fullMessage = `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}`;
                            const truncatedMessage = fullMessage.length > 7000 ? fullMessage.substring(0, 7000) : fullMessage;

                            return JSON.stringify({
                                model: result.cerebrasModel || 'llama3.1-8b',
                                messages: [
                                    {
                                        role: "system",
                                        content: config.instructions
                                    },
                                    ...limitedHistory.map(hist => ({
                                        role: hist.role.toLowerCase() === "user" ? "user" : "assistant",
                                        content: hist.message
                                    })),
                                    {
                                        role: "user",
                                        content: truncatedMessage
                                    }
                                ],
                                stream: false,
                                temperature: 0.7,
                                max_completion_tokens: 1000,
                                top_p: 0.95
                            });
                        };
                        config.isStreaming = false;
                        break;
                    default: // cohere
                        config.url = 'https://api.cohere.com/v1/chat';
                        config.headers = {
                            'Authorization': `Bearer ${result.cohereApiKey.trim()}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        };
                        config.body = (msg) => JSON.stringify({
                            message: `${config.instructions}\n${contextMessage}\n\n사용자 질문: ${msg}\n\n위 정보를 바탕으로 사용자의 질문에 답변해주세요.`,
                            chat_history: conversationHistory,
                            stream: true,
                            temperature: 0.7
                        });
                }

                resolve(config);
            });
        });
    }

    // 비스트리밍 응답 추출 함수
    function extractNonStreamingResponse(data, model) {
        if (model === 'Cerebras') {
            if (data.choices && data.choices.length > 0 && data.choices[0].message) {
                return data.choices[0].message.content;
            }
        } else if (model.startsWith('gemini') || model === 'gemini20Flash' || model === 'gemini25Flash' || model === 'gemini3Flash') {
            if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
                return data.candidates[0].content.parts.map(part => part.text).join('');
            }
        }
        console.error("Unexpected API response format:", data);
        return "API 응답 형식이 예상과 다릅니다.";
    }

    // 마지막 메시지에 모델 이름 추가 함수
    function addModelNameToLastMessage(model) {
        const aiModelNameSpan = document.createElement('span');
        aiModelNameSpan.textContent = `(${model})`;
        aiModelNameSpan.style.cssText = 'margin-left: 10px; font-size: 0.9em; color: #666;';
        chatMessages.appendChild(aiModelNameSpan);
    }

    // 이벤트 리스너 설정
    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') sendMessage();
    });
});

// 컨텐츠 스크립트 메시지 리스너
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageContent") {
        sendResponse({ content: document.body.innerText });
    }
    return true;
});