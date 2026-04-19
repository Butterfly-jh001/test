// 메뉴 텍스트 정의
const menuTexts = {
  ko: {
      summarizeFullPage: "전체 페이지 요약",
      generalSummary: "일반요약",   // ✅ 추가
      fullSummary: "Full 요약",
      mediumSummary: "보고서형식 요약",
      shortSummary: "간단한 요약",
      summarizeSelection: "선택 영역 요약",
      translateToEnglish: "영어로 번역",
      translateToKorean: "한글로 번역",
  },
  en: {
      summarizeFullPage: "Summarize Full Page",
      generalSummary: "General Summary",  // ✅ 추가
      fullSummary: "Full Summary",
      mediumSummary: "Report Style Summary",
      shortSummary: "Brief Summary",
      summarizeSelection: "Summarize Selection",
      translateToEnglish: "Translate to English",
      translateToKorean: "Translate to Korean",
  }
};

// 컨텍스트 메뉴 업데이트 함수
function updateContextMenus(language) {
  // 기존 메뉴 제거
  chrome.contextMenus.removeAll(() => {
      const texts = menuTexts[language] || menuTexts.ko;

      // 메뉴 다시 생성
      chrome.contextMenus.create({
          id: "summarizeFullPage",
          title: texts.summarizeFullPage,
          contexts: ["page"]
      });

      chrome.contextMenus.create({
          id: "generalSummary",
          title: texts.generalSummary,
          parentId: "summarizeFullPage",
          contexts: ["page"]
      });

      chrome.contextMenus.create({
          id: "fullSummary",
          title: texts.fullSummary,
          parentId: "summarizeFullPage",
          contexts: ["page"]
      });

      chrome.contextMenus.create({
          id: "mediumSummary",
          title: texts.mediumSummary,
          parentId: "summarizeFullPage",
          contexts: ["page"]
      });

      chrome.contextMenus.create({
          id: "shortSummary",
          title: texts.shortSummary,
          parentId: "summarizeFullPage",
          contexts: ["page"]
      });

      chrome.contextMenus.create({
          id: "summarizeSelection",
          title: texts.summarizeSelection,
          contexts: ["selection"]
      });

      chrome.contextMenus.create({
          id: "translateToEnglish",
          title: texts.translateToEnglish,
          contexts: ["selection"]
      });

      chrome.contextMenus.create({
          id: "translateToKorean",
          title: texts.translateToKorean,
          contexts: ["selection"]
      });

  });
}

// 확장 프로그램 설치/업데이트 시 실행
chrome.runtime.onInstalled.addListener(() => {
  // 기본 언어로 한국어 설정
  chrome.storage.sync.get('language', function(data) {
      const language = data.language || 'ko';
      updateContextMenus(language);
  });
});

// 언어 설정 변경 감지
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.language) {
      updateContextMenus(changes.language.newValue);
  }
});
  
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab.id === chrome.tabs.TAB_ID_NONE) {
    console.error('Cannot send message to this tab');
    return;
  }

  let action = info.menuItemId;
  let summaryType = "";

  if (["fullSummary", "mediumSummary", "shortSummary","generalSummary"].includes(action)) {
    summaryType = action;
    action = "summarizeFullPage";
  }

  chrome.tabs.sendMessage(tab.id, { 
    action: action,
    summaryType: summaryType,
    text: info.selectionText
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
    } else {
      console.log('Message sent successfully');
    }
  });
});

function sendMessage(tabId, info) {
  chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
  }, () => {
      if (chrome.runtime.lastError) {
          console.error('Failed to inject content script:', chrome.runtime.lastError.message);
      } else {
          const message = {
              action: info.menuItemId,
              text: info.selectionText
          };
          
          chrome.tabs.sendMessage(tabId, message, (response) => {
              if (chrome.runtime.lastError) {
                  console.error('Error:', chrome.runtime.lastError.message);
              } else {
                  console.log('Message sent successfully');
              }
          });
      }
  });
}

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// ── content.js 대신 fetch를 처리하는 중계 핸들러 ──────────────────────
// content script는 일부 사이트(네이버 등)에서 CORS로 직접 fetch가 막히므로
// background service worker가 대신 요청하고, 청크 단위로 실시간 전달한다.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'fetchProxy') return false;

  const { url, method, headers, body, streamId } = request;
  const tabId = sender.tab?.id;

  fetch(url, { method: method || 'POST', headers, body })
    .then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      const ok = res.ok;
      const status = res.status;

      // 응답 실패: 에러 텍스트를 한 번에 반환
      if (!ok) {
        const text = await res.text();
        sendResponse({ ok, status, contentType, done: true, chunk: '', text, error: null });
        return;
      }

      // 스트리밍 시작 알림 (ok, status, contentType 전달)
      sendResponse({ ok, status, contentType, done: false, chunk: '', text: '' });

      // ReadableStream을 청크 단위로 읽어 탭에 메시지 전송
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      const pushChunk = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (tabId != null) {
              chrome.tabs.sendMessage(tabId, {
                action: 'fetchProxyChunk',
                streamId,
                done: true,
                chunk: ''
              });
            }
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          if (tabId != null) {
            chrome.tabs.sendMessage(tabId, {
              action: 'fetchProxyChunk',
              streamId,
              done: false,
              chunk
            });
          }
        }
      };

      pushChunk().catch((err) => {
        if (tabId != null) {
          chrome.tabs.sendMessage(tabId, {
            action: 'fetchProxyChunk',
            streamId,
            done: true,
            chunk: '',
            error: err.message
          });
        }
      });
    })
    .catch((err) => {
      sendResponse({ ok: false, status: 0, contentType: '', done: true, chunk: '', text: '', error: err.message });
    });

  return true; // 비동기 sendResponse 유지
});