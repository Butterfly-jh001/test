My writing

제가 AI들의 도움을 받아 만들어본
웹페이지 요약 크롬 확장입니다.

Mistral

Cohere

Groq

Gemini (pro) / Flash / 2.0 Flash 추가 (2025-06-05)

cerebras

등을 사용 할 수 있습니다.

모두 무료 API사용이 가능합니다.

ollama는 표시되지만
아직 오류가 해결되지 않아 작동하지 않습니다.

"I've developed a Chrome extension for webpage summarization 
with the help of various AI models, 

including 

Mistral, 
Cohere, 
Groq, 
Gemini (pro), and Flash, 2.0 flash

All of these models offer free API usage. 

Although Ollama is listed, 
it's currently not functional due to unresolved errors."



For Korean

# 웹페이지 요약 크롬 확장프로그램

## 📝 프로젝트 소개
이 크롬 확장프로그램은 웹페이지의 내용을 빠르게 요약해주는 도구입니다. 사용자가 원하는 웹페이지의 내용을 AI를 활용하여 간편하게 요약하고, 사이드패널을 통해 대화형 인터페이스를 제공합니다.

### 주요 기능
- 컨텍스트 메뉴를 통한 웹페이지 요약 (일반 요약) (2025-08-13)
- 요약 내용에 마크다운 렌더링 적용 (2025-08-13)
- 사이드패널을 활용한 대화형 인터페이스
- 사용자 맞춤형 웹페이지 콘텐츠 요약

## ⚙️ 개발 환경
### 기술 스택
- Frontend: HTML, JavaScript
- 설정: JSON (manifest.json)

### 개발 도구
- OpenAI API
- Claude API
- Perplexity AI
- Cline (Claude Dev)
- Continue
- Visual Studio Code

## 🚀 설치 방법
1. 저장소 클론 또는 다운로드
2. 크롬 브라우저에서 `chrome://extensions` 접속
3. 우측 상단의 '개발자 모드' 활성화
4. 아래 파일들을 원하는 이름의 폴더를 만들어 넣어줍니다.

background.js

content.js

manifest.json

markdown.css

markdownRenderer.js

options.html

options.js

sidepanel.html

sidepanel.js

7. "압축해제된 확장프로그램을 로드합니다." 클릭 후 폴더 선택
8. 로드 완료

## 💡 사용 방법
1. 웹페이지에서 마우스 우클릭
2. 컨텍스트 메뉴에서 요약 기능 선택
3. 사이드패널에서 요약된 내용 확인
4. 필요한 경우 AI와 대화형으로 추가 정보 요청

## 🔍 기능 상세
- 웹페이지 텍스트 추출 및 요약
- AI 기반 지능형 콘텐츠 분석
- 사용자 맞춤형 대화 인터페이스
- 크롬 사이드패널 통합

## 📋 라이선스
이 프로젝트는 MIT 라이선스 하에 있습니다.

## 🤝 기여하기
1. 이 저장소를 포크합니다
2. 새로운 브랜치를 생성합니다
3. 변경사항을 커밋합니다
4. 브랜치에 푸시합니다
5. Pull Request를 생성합니다

## ⚠️ 주의사항
- 이 확장프로그램은 개인 사용 목적으로 개발되었습니다
- API 키는 별도로 설정해야 합니다


# Webpage Summary Chrome Extension

## 📝 Project Overview
This Chrome extension is a tool that quickly summarizes webpage content. It utilizes AI to easily summarize content from desired webpages and provides a conversational interface through a side panel.

### Key Features
- Webpage summarization via context menu (General Summary) (2025-08-13)
- Markdown rendering for summarized content (2025-08-13)
- Conversational interface using side panel
- Personalized webpage content summarization

## ⚙️ Development Environment
### Tech Stack
- Frontend: HTML, JavaScript
- Configuration: JSON (manifest.json)

### Development Tools
- OpenAI API
- Claude API
- Perplexity AI
- Cline (Claude Dev)
- Continue
- Visual Studio Code

## 🚀 Installation
1. Clone or download repository
2. Access `chrome://extensions` in Chrome browser
3. Enable 'Developer mode' in top right corner
4. Click 'Load unpacked extension'
5. Select downloaded project folder
6. Installation complete

## 💡 How to Use
1. Right-click on webpage
2. Select summary feature from context menu
3. View summarized content in side panel
4. Engage in conversational interaction with AI for additional information if needed

## 🔍 Detailed Features
- Webpage text extraction and summarization
- AI-powered intelligent content analysis
- Personalized conversational interface
- Chrome side panel integration

## 📋 License
This project is under the MIT License.

## 🤝 Contributing
1. Fork this repository
2. Create a new branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## ⚠️ Important Notes
- This extension was developed for personal use
- API keys need to be configured separately

## 📌 Additional Information
### Future Development Plans
- [Future features or improvements planned]

### Known Issues
- [List any known bugs or limitations]

### Dependencies
- [List major dependencies if any]

### Version History

**v1.1 (2025-08-12)**
- Added 'General Summary' feature to the context menu.
- Implemented Markdown rendering for summary results.
- 컨텍스트 메뉴에 '일반 요약' 기능 추가
- 요약 결과에 마크다운 렌더링 적용

**v1.0 (Initial Release)**
- Initial release
- 초기 릴리즈

## 📞 Contact
- [Your contact information if you wish to include]

---

Feel free to contribute to this project by submitting issues or pull requests.


