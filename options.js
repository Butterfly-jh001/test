document.addEventListener('DOMContentLoaded', function() {
  var cohereApiKeyInput = document.getElementById('cohereApiKey');
  var mistralApiKeyInput = document.getElementById('mistralApiKey');
  var geminiApiKeyInput = document.getElementById('geminiApiKey');
  var geminiflashApiKeyInput = document.getElementById('geminiflashApiKey');
  var groqApiKeyInput = document.getElementById('groqApiKey');
  var ollamaApiKeyInput = document.getElementById('ollamaApiKey');
  var ollamaModelNameInput = document.getElementById('ollamaModelName');
  var cerebrasApiKeyInput = document.getElementById('cerebrasApiKey');
  var cerebrasModelRadios = document.querySelectorAll('input[name="cerebrasModel"]');

  var aiModelSelect = document.getElementById('aiModel');
  var saveButton = document.getElementById('save');
  var status = document.getElementById('status');

  // 언어 선택 요소
const languageSelect = document.getElementById('language');

// 저장된 언어 설정 불러오기
chrome.storage.sync.get('language', function(data) {
    if (data.language) {
        languageSelect.value = data.language;
    }
});

// 언어 변경 시 저장
languageSelect.addEventListener('change', function() {
    chrome.storage.sync.set({ language: this.value }, function() {
        // 언어 변경 후 페이지 새로고침
        location.reload();
    });
});

// 페이지 로드 시 언어 적용
function applyLanguage() {
    chrome.storage.sync.get('language', function(data) {
        const lang = data.language || 'ko'; // 기본값은 한국어
        
        const translations = {
            ko: {
                title: 'AI 요약 확장 프로그램 설정',
                aiModelLabel: 'AI 모델 선택:',
                saveButton: '저장',
                apiKeyPlaceholder: 'API 키를 입력하세요',
                instructionLabel: 'Instruction:',
                instructionPlaceholder: 'Instruction을 입력하세요',
                addInstruction: 'Instruction 추가',
                deleteInstruction: 'Instruction 삭제',
                languageLabel: '언어 설정 (Language Setting):',
                statusSaved: '설정이 저장되었습니다.'
            },
            en: {
                title: 'AI Summary Extension Settings',
                aiModelLabel: 'Select AI Model:',
                saveButton: 'Save',
                apiKeyPlaceholder: 'Enter API Key',
                instructionLabel: 'Instruction:',
                instructionPlaceholder: 'Enter Instruction',
                addInstruction: 'Add Instruction',
                deleteInstruction: 'Delete Instruction',
                languageLabel: 'Language Setting (언어 설정):',
                statusSaved: 'Settings saved successfully.'
            }
        };

        // 텍스트 요소들 업데이트
        document.title = translations[lang].title;
        document.querySelector('h1').textContent = translations[lang].title;
        document.querySelector('label[for="aiModel"]').textContent = translations[lang].aiModelLabel;
        document.querySelector('#save').textContent = translations[lang].saveButton;
        document.querySelector('label[for="instructionInput"]').textContent = translations[lang].instructionLabel;
        document.querySelector('#instructionInput').placeholder = translations[lang].instructionPlaceholder;
        document.querySelector('#addInstruction').textContent = translations[lang].addInstruction;
        document.querySelector('#deleteInstruction').textContent = translations[lang].deleteInstruction;
        document.querySelector('label[for="language"]').textContent = translations[lang].languageLabel;

        // API 키 입력 필드 플레이스홀더 업데이트
        const apiInputs = document.querySelectorAll('input[type="text"][id$="ApiKey"]');
        apiInputs.forEach(input => {
            input.placeholder = translations[lang].apiKeyPlaceholder;
        });
    });
}

// 페이지 로드 시 언어 적용
applyLanguage();

  function updateUI(data) {
      cohereApiKeyInput.value = data.cohereApiKey || '';
      mistralApiKeyInput.value = data.mistralApiKey || '';
      geminiApiKeyInput.value = data.geminiApiKey || '';
      geminiflashApiKeyInput.value = data.geminiflashApiKey || '';
      groqApiKeyInput.value = data.groqApiKey || '';
      ollamaApiKeyInput.value = data.ollamaApiKey || '';
      ollamaModelNameInput.value = data.ollamaModelName || '';
      cerebrasApiKeyInput.value = data.cerebrasApiKey || '';
      aiModelSelect.value = data.selectedModel || 'cohere';

      cerebrasModelRadios.forEach(function(radio) {
          radio.checked = data.cerebrasModel === radio.value;
      });

      updateApiKeyVisibility(aiModelSelect.value);
  }

  function updateApiKeyVisibility(selectedModel) {
    const cohereSection = document.getElementById('cohereApiSection');
    const mistralSection = document.getElementById('mistralApiSection');
    const geminiSection = document.getElementById('geminiApiSection');
    const geminiflashSection = document.getElementById('geminiflashApiSection');
    const groqSection = document.getElementById('groqApiSection');
    const ollamaSection = document.getElementById('ollamaApiSection');
    const ollamaModelNameSection = document.getElementById('ollamaModelNameSection');
    const cerebrasSection = document.getElementById('cerebrasApiSection');

    cohereSection.style.display = selectedModel === 'cohere' ? 'block' : 'none';
    mistralSection.style.display = selectedModel === 'mistralSmall' ? 'block' : 'none';
    geminiSection.style.display = selectedModel === 'gemini' ? 'block' : 'none';
    geminiflashSection.style.display = selectedModel === 'geminiflash' ? 'block' : 'none';
    groqSection.style.display = selectedModel === 'groq' ? 'block' : 'none';
    ollamaSection.style.display = selectedModel === 'ollama' ? 'block' : 'none';
    ollamaModelNameSection.style.display = selectedModel === 'ollama' ? 'block' : 'none';
    cerebrasSection.style.display = selectedModel === 'Cerebras' ? 'block' : 'none';
  }

  // 저장된 설정 불러오기
  chrome.storage.sync.get(['cohereApiKey', 'mistralApiKey', 'geminiApiKey', 'geminiflashApiKey', 'groqApiKey', 'ollamaApiKey', 'ollamaModelName', 'selectedModel', 'cerebrasApiKey', 'cerebrasModel'], function(data) {
      updateUI(data);
  });

  // 저장 버튼 클릭 이벤트
  saveButton.addEventListener('click', function() {
    var cohereApiKey = cohereApiKeyInput.value.trim();
    var mistralApiKey = mistralApiKeyInput.value.trim();
    var geminiApiKey = geminiApiKeyInput.value.trim();
    var geminiflashApiKey = geminiflashApiKeyInput.value.trim();
    var groqApiKey = groqApiKeyInput.value.trim();
    var ollamaApiKey = ollamaApiKeyInput.value.trim();
    var ollamaModelName = ollamaModelNameInput.value.trim();
    var cerebrasApiKey = cerebrasApiKeyInput.value.trim();
    var selectedModel = aiModelSelect.value;
    var cerebrasModel;

    cerebrasModelRadios.forEach(function(radio) {
        if (radio.checked) {
            cerebrasModel = radio.value;
        }
    });

    var dataToSave = {
        cohereApiKey: cohereApiKey,
        mistralApiKey: mistralApiKey,
        geminiApiKey: geminiApiKey,
        geminiflashApiKey: geminiflashApiKey,
        groqApiKey: groqApiKey,
        ollamaApiKey: ollamaApiKey,
        ollamaModelName: ollamaModelName,
        selectedModel: selectedModel,
        cerebrasApiKey: cerebrasApiKey,
        cerebrasModel: cerebrasModel
    };

      chrome.storage.sync.set(dataToSave, function() {
          if (chrome.runtime.lastError) {
              status.textContent = '설정 저장 중 오류가 발생했습니다.';
              console.error('Error saving settings:', chrome.runtime.lastError);
          } else {
              status.textContent = '설정이 저장되었습니다.';
              setTimeout(function() {
                  status.textContent = '';
              }, 3000);
          }
      });
  });

  // AI 모델 선택 변경 이벤트
  aiModelSelect.addEventListener('change', function() {
      updateApiKeyVisibility(this.value);
  });

  // instruction 관련 요소 가져오기
  const instructionInput = document.getElementById('instructionInput');
  const addInstructionButton = document.getElementById('addInstruction');
  const instructionList = document.getElementById('instructionList');
  const deleteInstructionButton = document.getElementById('deleteInstruction');

  // instruction 추가 기능
  addInstructionButton.addEventListener('click', function() {
    const instruction = instructionInput.value.trim();
    if (instruction) {
      const option = document.createElement('option');
      option.value = instruction;
      option.text = instruction;
      instructionList.appendChild(option);
      instructionInput.value = '';

      // instruction 저장
      chrome.storage.sync.get('instructions', function(data) {
        const instructions = data.instructions || [];
        instructions.push(instruction);
        chrome.storage.sync.set({ instructions: instructions });
      });
    }
  });

  // instruction 삭제 기능
  deleteInstructionButton.addEventListener('click', function() {
    const selectedInstruction = instructionList.value;
    if (selectedInstruction) {
      const optionToRemove = instructionList.querySelector(`option[value="${selectedInstruction}"]`);
      if (optionToRemove) {
        instructionList.removeChild(optionToRemove);

        // instruction 저장
        chrome.storage.sync.get('instructions', function(data) {
          const instructions = data.instructions || [];
          const index = instructions.indexOf(selectedInstruction);
          if (index > -1) {
            instructions.splice(index, 1);
            chrome.storage.sync.set({ instructions: instructions });
          }
        });
      }
    }
  });

  // 저장된 instruction 불러오기
  chrome.storage.sync.get('instructions', function(data) {
    const instructions = data.instructions || [];
    instructions.forEach(function(instruction) {
      const option = document.createElement('option');
      option.value = instruction;
      option.text = instruction;
      instructionList.appendChild(option);
    });
  });

});
