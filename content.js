console.log('Content script loaded');

function getPageContent() {
  return document.body.innerText;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request);
  
  if (request.action === "getPageContent") {
    sendResponse({content: getPageContent()});
  } else {
    switch (request.action) {
      case "summarizeFullPage":
        summarizeFullPage(request.summaryType);
        break;
      case "summarizeSelection":
        summarizeSelection(request.text);
        break;
      case "translateToEnglish":
        translate(request.text, "영어");
        break;
      case "translateToKorean":
        translate(request.text, "한국어");
        break;
    }
    sendResponse({received: true});
  }
  return true; // 비동기 응답을 위해 true 반환
});

function summarizeFullPage(summaryType) {
  const fullText = document.body.innerText;
  let instruction;

  switch (summaryType) {
    case "fullSummary":
      instruction = "핵심 내용 추출다음 텍스트를 요약하여 가장 중요한 핵심 내용만 3가지 문장으로 나타내주세요.이 글의 주요 논점을 간결하게 요약해주세요. 강조하고 싶은 부분 지정이 글에서 '결론' 부분을 자세히 요약해주세요.텍스트에서 '문제점'과 '해결 방안'에 대한 내용을 중심으로 요약해주세요.마크다운 형식은 사용하지 않는다.";
      break;
    case "mediumSummary":
      instruction = "다음 웹페이지의 내용을 읽고, 알맞은 요약 형식을 선택한 후 그 형식에 맞춰 주요 내용을 요약해주세요. 그리고 해당 방식을 보고서 형식으로 요약해줘.";
      break;
    case "shortSummary":
      instruction = "간단히 요약해주세요. 가장 중요한 핵심만을 간결하게 담아주세요.";
      break;
  }

  sendToAI(fullText, instruction);
}

function summarizeSelection(text) {
  sendToAI(text, "선택한 텍스트를 요약해주세요.");
}

function translate(text, targetLanguage) {
  sendToAI(text, `이 텍스트를 ${targetLanguage}로 번역해주세요.`);
}

function updateProgress(message) {
  const progressText = document.getElementById('progressText');
  if (progressText) {
    progressText.textContent = message;
  }
}

function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'summaryOverlay';
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 350px;
    max-height: 80%;
    background-color: #fff8e7;
    border: 1px solid #d2b48c;
    border-radius: 15px;
    padding: 25px;
    box-shadow: 0 4px 15px rgba(78, 54, 41, 0.1);
    z-index: 9999;
    overflow-y: auto;
    font-family: Arial, sans-serif;
    color: #4e3629;
  `;
  return overlay;
}

function removeExistingOverlay() {
  const existingOverlay = document.getElementById('summaryOverlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
}

function sendToAI(text, instruction) {
  chrome.storage.sync.get('instructions', function(data) {
    const instructions = data.instructions || [];
    const combinedInstruction = instructions.join('\n') + '\n' + instruction;
    showLoading(combinedInstruction);
    updateProgress("API에 요청을 보내는 중...");

    chrome.storage.sync.get(['cohereApiKey', 'mistralApiKey', 'selectedModel'], function(result) {
      if (!result.cohereApiKey && !result.mistralApiKey) {
        showResult("API 키를 설정해주세요.");
        return;
      }

      updateProgress("작업을 시작합니다...");

      let apiUrl, headers, body;

      if (result.selectedModel === 'mistralSmall') {
        apiUrl = 'https://api.mistral.ai/v1/chat/completions';
        headers = {
          'Authorization': `Bearer ${result.mistralApiKey.trim()}`,
          'Content-Type': 'application/json'
        };
        body = JSON.stringify({
          model: "mistral-small-latest",
          messages: [{ role: "user", content: `${combinedInstruction}\n\n텍스트: ${text}` }],
          stream: true
        });
      } else {
        apiUrl = 'https://api.cohere.com/v1/chat';
        headers = {
          'Authorization': `Bearer ${result.cohereApiKey.trim()}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        };
        body = JSON.stringify({
          message: `${combinedInstruction}\n\n텍스트: ${text}`,
          stream: true,
          temperature: 0
        });
      }

      chrome.runtime.sendMessage({ action: "isSidePanelOpen" }, (response) => {
        let contextMessage;
        if (response && response.isOpen) {
          contextMessage = "사이드 패널이 열려 있어서 현재 페이지의 내용만 사용합니다.";
        } else {
          contextMessage = `현재 웹페이지의 내용: ${text}`;
        }

        fetch(apiUrl, {
          method: 'POST',
          headers: headers,
          body: body
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const reader = response.body.getReader();
          let accumulatedResponse = "";
          let buffer = "";

          function readStream() {
            reader.read().then(({ done, value }) => {
              if (done) {
                showResult(accumulatedResponse);
                return;
              }
              const chunk = new TextDecoder().decode(value);
              buffer += chunk;
            
              let newlineIndex;
              while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
              
                if (line !== '') {
                  let jsonLine = line;
                  // Check and remove 'data: ' prefix if present
                  if (line.startsWith('data: ')) {
                    jsonLine = line.slice(6);
                  }
                  // Check and remove 'event: ' prefix if present
                  if (jsonLine.startsWith('event:')) {
                    continue; // Skip event lines
                  }

                  // Only parse if it starts with '{'
                  if (jsonLine.startsWith('{')) {
                    try {
                      const parsed = JSON.parse(jsonLine);
                      if (result.selectedModel === 'mistralSmall') {
                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                          accumulatedResponse += parsed.choices[0].delta.content;
                        }
                      } else {
                        if (parsed.event_type === 'text-generation') {
                          accumulatedResponse += parsed.text;
                        }
                      }
                      updateProgress(`처리 중: ${accumulatedResponse.length} 글자...`);
                      updatePartialResult(accumulatedResponse);
                    } catch (e) {
                      console.warn('Incomplete JSON, buffering:', e);
                    }
                  }
                }
              }
            
              readStream();
            });
          }

          readStream();
        })
        .catch(error => {
          console.error('Error:', error);
          showResult(`API 요청 중 오류가 발생했습니다: ${error.message}`);
        });
      });
    });
  });
}

function updatePartialResult(text) {
  const overlay = document.getElementById('summaryOverlay');
  if (overlay) {
    const resultElement = overlay.querySelector('#partialResult');
    if (resultElement) {
      resultElement.innerHTML = text.replace(/\n/g, '<br>');
    } else {
      const newResultElement = document.createElement('div');
      newResultElement.id = 'partialResult';
      newResultElement.innerHTML = text.replace(/\n/g, '<br>');
      overlay.appendChild(newResultElement);
    }
  }
}

function showResult(result) {
  removeExistingOverlay();
  const overlay = createOverlay();
  const content = document.createElement('div');
  content.innerHTML = `
    <h2 style="margin-top: 0; margin-bottom: 20px; color: #2c3e50;">결과</h2>
    <div id="resultText" style="margin-bottom: 20px; line-height: 1.6; color: #444;">${result.replace(/\n/g, '<br>')}</div>
    <button id="closeOverlay">닫기</button>
    <button id="copyResult">복사</button>
    <span id="aiModelName"></span>
  `;
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  document.getElementById('closeOverlay').addEventListener('click', removeExistingOverlay);

  document.getElementById('copyResult').addEventListener('click', function() {
    const resultText = document.getElementById('resultText');
    if (resultText) {
      navigator.clipboard.writeText(resultText.innerText)
        .then(() => {
          console.log('Content copied to clipboard');
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
        });
    }
  });

  chrome.storage.sync.get(['selectedModel'], function(items) {
    const aiModelName = items.selectedModel;
    const aiModelSpan = document.getElementById('aiModelName');
    if (aiModelSpan) {
      aiModelSpan.textContent = `(${aiModelName})`;
    }
  });
}

function showLoading(instruction) {
  removeExistingOverlay();
  const overlay = createOverlay();
  const content = document.createElement('div');
  content.innerHTML = `
    <h2 style="margin-top: 0; margin-bottom: 20px; color: #333;">작업 중...</h2>
    <p style="margin-bottom: 15px; color: #666;"><strong>현재 작업:</strong> ${instruction}</p>
    <div class="loader"></div>
    <p id="progressText" style="margin-top: 20px;">작업을 시작합니다...</p>
    <p id="partialResult"></p>
  `;
  overlay.appendChild(content);
  document.body.appendChild(overlay);

  const style = document.createElement('style');
  style.textContent = `
    .loader {
      border: 5px solid #f3f3f3;
      border-top: 5px solid #3498db;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    #partialResult {
      margin-top: 20px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.6;
      color: #444;
    }
    #summaryOverlay div {
      line-height: 1.6;
      margin-bottom: 15px;
    }
    #summaryOverlay h2 {
      font-size: 1.4em;
      color: #2c3e50;
    }
    #summaryOverlay button {
      background-color: #3498db;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 1em;
      transition: background-color 0.3s;
    }
    #summaryOverlay button:hover {
      background-color: #2980b9;
    }
    #aiModelName {
      margin-left: 10px;
      font-size: 0.9em;
      color: #666;
    }
  `;
  document.head.appendChild(style);
}
