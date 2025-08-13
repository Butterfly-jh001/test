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
          contexts: ["selection", "page"]
      });

      chrome.contextMenus.create({
          id: "translateToEnglish",
          title: texts.translateToEnglish,
          contexts: ["selection", "page"]
      });

      chrome.contextMenus.create({
          id: "translateToKorean",
          title: texts.translateToKorean,
          contexts: ["selection", "page"]
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
  
async function getSelectionFromFrames(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true, matchAboutBlank: true },
      world: 'ISOLATED',
      func: () => {
        try {
          const active = document.activeElement;
          let selected = '';
          if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
            const start = active.selectionStart || 0;
            const end = active.selectionEnd || 0;
            selected = (active.value || '').substring(start, end);
          } else if (window.getSelection) {
            selected = String(window.getSelection());
          }
          return selected || '';
        } catch (e) {
          return '';
        }
      }
    });
    const texts = (results || [])
      .map(r => (r && typeof r.result === 'string') ? r.result.trim() : '')
      .filter(Boolean);
    if (texts.length === 0) return '';
    // pick the longest selection as best guess
    return texts.reduce((a, b) => (b.length > a.length ? b : a), '');
  } catch (e) {
    console.warn('Selection extraction failed:', e);
    return '';
  }
}

async function ensureInjectedAndResend(tabId, payload) {
  try {
    // Try to inject CSS (ignore errors)
    try {
      await chrome.scripting.insertCSS({ target: { tabId, allFrames: true }, files: ['markdown.css'] });
    } catch (e) {}

    // Inject shared renderer and content script in all frames
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true, matchAboutBlank: true },
      files: ['markdownRenderer.js', 'content.js']
    });
  } catch (e) {
    console.warn('Script injection encountered an issue:', e);
  }
  // Resend message
  chrome.tabs.sendMessage(tabId, payload, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Resend failed:', chrome.runtime.lastError.message);
    } else {
      console.log('Message resent successfully');
    }
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || tab.id === chrome.tabs.TAB_ID_NONE) {
    console.error('Cannot send message to this tab');
    return;
  }

  let action = info.menuItemId;
  let summaryType = "";

  if (["fullSummary", "mediumSummary", "shortSummary","generalSummary"].includes(action)) {
    summaryType = action;
    action = "summarizeFullPage";
  }

  // Robust selection handling for iframes/editables
  const isSelectionAction = action === 'summarizeSelection' || action === 'translateToEnglish' || action === 'translateToKorean';
  let selectionText = (info && typeof info.selectionText === 'string') ? info.selectionText.trim() : '';
  if (isSelectionAction && !selectionText) {
    selectionText = await getSelectionFromFrames(tab.id);
  }

  const payload = { action, summaryType, text: selectionText };
  chrome.tabs.sendMessage(tab.id, payload, (response) => {
    if (chrome.runtime.lastError || !response) {
      console.warn('Initial send failed or no response, attempting injection...', chrome.runtime.lastError?.message || 'no response');
      ensureInjectedAndResend(tab.id, payload);
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