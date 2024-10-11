document.addEventListener('DOMContentLoaded', function() {
    var cohereApiKeyInput = document.getElementById('cohereApiKey');
    var mistralApiKeyInput = document.getElementById('mistralApiKey');
    var geminiApiKeyInput = document.getElementById('geminiApiKey');
    var groqApiKeyInput = document.getElementById('groqApiKey');
    var aiModelSelect = document.getElementById('aiModel');
    var saveButton = document.getElementById('save');
    var status = document.getElementById('status');

    function updateUI(data) {
        cohereApiKeyInput.value = data.cohereApiKey || '';
        mistralApiKeyInput.value = data.mistralApiKey || '';
        geminiApiKeyInput.value = data.geminiApiKey || '';
        groqApiKeyInput.value = data.groqApiKey || '';
        aiModelSelect.value = data.selectedModel || 'cohere';
        updateApiKeyVisibility(aiModelSelect.value);
        console.log('Loaded settings:', data); // 디버깅을 위한 로그
    }

    function updateApiKeyVisibility(selectedModel) {
        const cohereSection = document.getElementById('cohereApiSection');
        const mistralSection = document.getElementById('mistralApiSection');
        const geminiSection = document.getElementById('geminiApiSection');
        const groqSection = document.getElementById('groqApiSection');
        
        cohereSection.style.display = selectedModel === 'cohere' ? 'block' : 'none';
        mistralSection.style.display = selectedModel === 'mistralSmall' ? 'block' : 'none';
        geminiSection.style.display = selectedModel === 'geminiFlash' ? 'block' : 'none';
        groqSection.style.display = selectedModel === 'groq' ? 'block' : 'none';
    }

    // 저장된 설정 불러오기
    chrome.storage.sync.get(['cohereApiKey', 'mistralApiKey', 'geminiApiKey', 'groqApiKey', 'selectedModel'], function(data) {
        updateUI(data);
    });

    // 저장 버튼 클릭 이벤트
    saveButton.addEventListener('click', function() {
        var cohereApiKey = cohereApiKeyInput.value.trim();
        var mistralApiKey = mistralApiKeyInput.value.trim();
        var geminiApiKey = geminiApiKeyInput.value.trim();
        var groqApiKey = groqApiKeyInput.value.trim();
        var selectedModel = aiModelSelect.value;

        var dataToSave = {
            cohereApiKey: cohereApiKey,
            mistralApiKey: mistralApiKey,
            geminiApiKey: geminiApiKey,
            groqApiKey: groqApiKey,
            selectedModel: selectedModel
        };

        console.log('Saving settings:', dataToSave); // 저장 전 로그

        chrome.storage.sync.set(dataToSave, function() {
            if (chrome.runtime.lastError) {
                status.textContent = '설정 저장 중 오류가 발생했습니다.';
                console.error('Error saving settings:', chrome.runtime.lastError);
            } else {
                status.textContent = '설정이 저장되었습니다.';
                console.log('Saved settings:', dataToSave); // 저장 후 로그
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
});
