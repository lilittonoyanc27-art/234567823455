import { LESSONS } from './data.js';

const STORAGE_KEY = 'habla_es_hy_progress_v1';

const state = {
  lessonId: LESSONS[0].id,
  partId: LESSONS[0].parts[0].id,
  direction: 'es-hy', // 'es-hy' (default: click Spanish -> Armenian) | 'hy-es'
  viewMode: 'list', // 'list' | 'focus'
  searchQuery: '',
  openTranslations: new Set(),
  openAnswers: new Set(),
  doneItems: loadDoneItems(),
  focusIndices: {}, // partId -> current index in focus/oral mode
  oralTopics: { 'hs-p4': 'hotel' }, // partId -> active topic tab id
  oralOrders: {}, // deckKey -> shuffled array of indices or null
};

function loadDoneItems() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveDoneItems() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.doneItems]));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getLesson() {
  return LESSONS.find((l) => l.id === state.lessonId) || LESSONS[0];
}

function getPart(lesson = getLesson()) {
  return lesson.parts.find((p) => p.id === state.partId) || lesson.parts[0];
}

function getPartCount(part) {
  if (part.type === 'situations') return part.items.length;
  if (part.type === 'questions') {
    return part.groups.reduce((sum, g) => sum + g.items.length, 0);
  }
  if (part.type === 'dialogues') {
    return part.dialogues.reduce((sum, d) => sum + d.turns.length, 0);
  }
  if (part.type === 'oral') {
    if (part.topicTabs) {
      return part.topicTabs.reduce((sum, t) => sum + t.cards.length, 0);
    }
    return part.cards.length;
  }
  return 0;
}

function getAllTrackableItemIds(lesson) {
  const ids = [];
  for (const part of lesson.parts) {
    if (part.type === 'situations') {
      for (const item of part.items) {
        ids.push(`${part.id}:s:${item.num}`);
      }
    } else if (part.type === 'questions') {
      for (const g of part.groups) {
        for (const item of g.items) {
          ids.push(`${part.id}:q:${item.num}`);
        }
      }
    }
  }
  return ids;
}

function speakSpanish(text) {
  if (!('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'es-ES';
    utter.rate = 0.94;
    const voices = window.speechSynthesis.getVoices();
    const esVoice =
      voices.find((v) => v.lang.toLowerCase().startsWith('es-es')) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('es'));
    if (esVoice) utter.voice = esVoice;
    window.speechSynthesis.speak(utter);
  } catch {
    // Ignore speech synthesis errors
  }
}

const SPEAKER_ICON = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
  </svg>
`;

const CHECK_ICON = `
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
`;

function renderPhrase({ id, es, hy, variant = '', showHint = false }) {
  const isEsFirst = state.direction === 'es-hy';
  const primaryText = isEsFirst ? es : hy;
  const hiddenText = isEsFirst ? hy : es;
  const hiddenLangLabel = isEsFirst ? 'Հայերեն' : 'Español';
  const isOpen = state.openTranslations.has(id);

  const hintHtml = showHint
    ? `<span class="phrase-hint">${isOpen ? 'скрыть перевод' : 'нажмите для перевода'}</span>`
    : '';

  const showSpeak = isEsFirst || isOpen;

  return `
    <div class="phrase-wrap">
      <div class="phrase-row">
        <button
          type="button"
          class="phrase-trigger ${variant}"
          data-action="toggle-translation"
          data-id="${escapeHtml(id)}"
          aria-expanded="${isOpen ? 'true' : 'false'}"
          title="${isEsFirst ? 'Нажмите, чтобы открыть перевод на армянский' : 'Нажмите, чтобы открыть перевод на испанский'}"
        >
          <span class="phrase-underline">${escapeHtml(primaryText)}</span>${hintHtml}
        </button>
        ${
          showSpeak
            ? `<button
                type="button"
                class="speak-btn"
                data-action="speak"
                data-text="${escapeHtml(es)}"
                title="Прослушать по-испански"
                aria-label="Прослушать по-испански"
              >${SPEAKER_ICON}</button>`
            : ''
        }
      </div>
      ${
        isOpen
          ? `<div class="translation-box">
              <span class="translation-lang">${hiddenLangLabel}:</span>${escapeHtml(hiddenText)}
            </div>`
          : ''
      }
    </div>
  `;
}

function getActiveTopNavKey() {
  if (state.lessonId === 'aeropuerto-1') return 'aeropuerto-1';
  if (state.lessonId === 'aeropuerto-2') return 'aeropuerto-2';
  if (state.partId.startsWith('hs-p2')) return 'supermercado';
  return 'hotel';
}

function renderTopbar() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  const activeNav = getActiveTopNavKey();
  const navItems = [
    { key: 'aeropuerto-1', label: 'Аэропорт 1', lessonId: 'aeropuerto-1', partId: 'a1-p1' },
    { key: 'aeropuerto-2', label: 'Аэропорт 2', lessonId: 'aeropuerto-2', partId: 'a2-p1' },
    { key: 'hotel', label: 'Отель', lessonId: 'hotel-supermercado', partId: 'hs-p1-sit' },
    { key: 'supermercado', label: 'Супермаркет', lessonId: 'hotel-supermercado', partId: 'hs-p2-sit' },
  ];

  topbar.innerHTML = `
    <div class="topbar-inner">
      <button type="button" class="brand" data-action="go-home">Habla · Խոսենք</button>
      <nav class="topnav" aria-label="Темы уроков">
        ${navItems
          .map(
            (item) => `
          <button
            type="button"
            class="topnav-link ${activeNav === item.key ? 'is-active' : ''}"
            data-action="select-nav"
            data-lesson="${item.lessonId}"
            data-part="${item.partId}"
          >${item.label}</button>
        `
          )
          .join('')}
      </nav>
      <button type="button" class="topbar-cta" data-action="open-oral">Устная практика</button>
    </div>
  `;
}

function renderSidebar(lesson, activePart) {
  const trackable = getAllTrackableItemIds(lesson);
  const doneCount = trackable.filter((id) => state.doneItems.has(id)).length;
  const pct = trackable.length > 0 ? Math.round((doneCount / trackable.length) * 100) : 0;

  return `
    <aside class="sidebar">
      <div class="sidebar-panel">
        <h2 class="sidebar-heading">Разделы урока</h2>
        <div class="part-list">
          ${lesson.parts
            .map(
              (part) => `
            <button
              type="button"
              class="part-btn ${part.id === activePart.id ? 'is-active' : ''}"
              data-action="select-part"
              data-part="${part.id}"
            >
              <span>${escapeHtml(part.shortLabel)}</span>
              <span class="part-count">${getPartCount(part)}</span>
            </button>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="sidebar-panel">
        <h2 class="sidebar-heading">Направление перевода</h2>
        <div class="segmented" role="group" aria-label="Направление перевода">
          <button
            type="button"
            class="segmented-btn ${state.direction === 'es-hy' ? 'is-active' : ''}"
            data-action="set-direction"
            data-dir="es-hy"
          >ES → HY</button>
          <button
            type="button"
            class="segmented-btn ${state.direction === 'hy-es' ? 'is-active' : ''}"
            data-action="set-direction"
            data-dir="hy-es"
          >HY → ES</button>
        </div>
        <p class="sidebar-hint">
          ${
            state.direction === 'es-hy'
              ? 'Клик по испанскому тексту открывает армянский перевод. Кнопка «Ответ» показывает ответ.'
              : 'Клик по армянскому тексту открывает испанский вариант. Кнопка «Ответ» показывает ответ.'
          }
        </p>
      </div>

      <div class="sidebar-panel">
        <div class="progress-block">
          <div class="progress-row">
            <span>Пройдено в уроке</span>
            <span class="progress-num">${doneCount} / ${trackable.length}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
        </div>
        ${
          doneCount > 0
            ? `<button type="button" class="link-reset" data-action="reset-lesson-progress">Сбросить отметки урока</button>`
            : ''
        }
      </div>
    </aside>
  `;
}

function getPhraseIdsForPart(part) {
  const phraseIds = [];
  const answerIds = [];

  if (part.type === 'situations') {
    for (const item of part.items) {
      const base = `${part.id}:s:${item.num}`;
      phraseIds.push(`${base}:title`, `${base}:sit`, `${base}:q`, `${base}:a`);
      answerIds.push(`${base}:ans`);
    }
  } else if (part.type === 'questions') {
    for (const group of part.groups) {
      for (const item of group.items) {
        const base = `${part.id}:q:${item.num}`;
        phraseIds.push(`${base}:q`, `${base}:a`);
        answerIds.push(`${base}:ans`);
      }
    }
  } else if (part.type === 'dialogues') {
    part.dialogues.forEach((d, dIdx) => {
      d.turns.forEach((turn, tIdx) => {
        const base = `${part.id}:d:${dIdx}:t:${tIdx}`;
        phraseIds.push(`${base}:line`);
        if (turn.isReply) {
          answerIds.push(`${base}:ans`);
        }
      });
    });
  }

  return { phraseIds, answerIds };
}

function matchesSearch(fields, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => String(f || '').toLowerCase().includes(q));
}

function renderSituationCard(partId, item) {
  const base = `${partId}:s:${item.num}`;
  const answerId = `${base}:ans`;
  const isAnswerOpen = state.openAnswers.has(answerId);
  const isDone = state.doneItems.has(base);

  return `
    <article class="card ${isDone ? 'is-done' : ''}">
      <div class="card-top">
        <div class="card-meta-line">
          <span class="card-index">${String(item.num).padStart(2, '0')}.</span>
          ${renderPhrase({
            id: `${base}:title`,
            es: item.titleEs,
            hy: item.titleHy,
            variant: 'is-title',
          })}
        </div>
        <button
          type="button"
          class="done-btn ${isDone ? 'is-done' : ''}"
          data-action="toggle-done"
          data-id="${base}"
          aria-pressed="${isDone ? 'true' : 'false'}"
        >
          ${isDone ? CHECK_ICON : ''}
          <span>${isDone ? 'Пройдено' : 'Отметить'}</span>
        </button>
      </div>

      <div class="field-group">
        <span class="field-label">Situación · Ситуация</span>
        ${renderPhrase({
          id: `${base}:sit`,
          es: item.sitEs,
          hy: item.sitHy,
        })}
      </div>

      <div class="field-group">
        <span class="field-label">Pregunta · Вопрос</span>
        ${renderPhrase({
          id: `${base}:q`,
          es: item.qEs,
          hy: item.qHy,
          variant: 'is-large',
        })}
      </div>

      <div class="card-actions">
        <button
          type="button"
          class="btn btn-answer ${isAnswerOpen ? 'is-open' : ''}"
          data-action="toggle-answer"
          data-id="${answerId}"
          aria-expanded="${isAnswerOpen ? 'true' : 'false'}"
        >${isAnswerOpen ? 'Скрыть ответ' : 'Посмотреть ответ'}</button>
      </div>

      ${
        isAnswerOpen
          ? `<div class="answer-panel">
              <span class="field-label">Respuesta · Ответ</span>
              ${renderPhrase({
                id: `${base}:a`,
                es: item.aEs,
                hy: item.aHy,
                showHint: true,
              })}
            </div>`
          : ''
      }
    </article>
  `;
}

function renderQuestionCard(partId, item) {
  const base = `${partId}:q:${item.num}`;
  const answerId = `${base}:ans`;
  const isAnswerOpen = state.openAnswers.has(answerId);
  const isDone = state.doneItems.has(base);

  return `
    <article class="card ${isDone ? 'is-done' : ''}">
      <div class="card-top">
        <div class="card-meta-line">
          <span class="card-index">Вопрос ${String(item.num).padStart(2, '0')}</span>
        </div>
        <button
          type="button"
          class="done-btn ${isDone ? 'is-done' : ''}"
          data-action="toggle-done"
          data-id="${base}"
          aria-pressed="${isDone ? 'true' : 'false'}"
        >
          ${isDone ? CHECK_ICON : ''}
          <span>${isDone ? 'Пройдено' : 'Отметить'}</span>
        </button>
      </div>

      <div class="field-group">
        ${renderPhrase({
          id: `${base}:q`,
          es: item.qEs,
          hy: item.qHy,
          variant: 'is-large',
        })}
      </div>

      <div class="card-actions">
        <button
          type="button"
          class="btn btn-answer ${isAnswerOpen ? 'is-open' : ''}"
          data-action="toggle-answer"
          data-id="${answerId}"
          aria-expanded="${isAnswerOpen ? 'true' : 'false'}"
        >${isAnswerOpen ? 'Скрыть ответ' : 'Посмотреть ответ'}</button>
      </div>

      ${
        isAnswerOpen
          ? `<div class="answer-panel">
              <span class="field-label">Ejemplo de respuesta · Пример ответа</span>
              ${renderPhrase({
                id: `${base}:a`,
                es: item.aEs,
                hy: item.aHy,
                showHint: true,
              })}
            </div>`
          : ''
      }
    </article>
  `;
}

function renderFocusView(part, items, renderCardFn) {
  if (items.length === 0) {
    return `<div class="empty-state">По запросу ничего не найдено. Попробуйте изменить поиск.</div>`;
  }

  let idx = state.focusIndices[part.id] || 0;
  if (idx >= items.length) idx = items.length - 1;
  if (idx < 0) idx = 0;
  state.focusIndices[part.id] = idx;

  return `
    <div class="cards-grid">
      ${renderCardFn(items[idx])}
      <div class="trainer-nav">
        <button
          type="button"
          class="btn"
          data-action="focus-prev"
          data-part="${part.id}"
          data-total="${items.length}"
        >← Предыдущая</button>
        <span class="trainer-counter">${idx + 1} / ${items.length}</span>
        <button
          type="button"
          class="btn btn-primary"
          data-action="focus-next"
          data-part="${part.id}"
          data-total="${items.length}"
        >Следующая →</button>
      </div>
    </div>
  `;
}

function renderSituationsBody(part) {
  const filtered = part.items.filter((item) =>
    matchesSearch(
      [item.titleEs, item.titleHy, item.sitEs, item.sitHy, item.qEs, item.qHy, item.aEs, item.aHy],
      state.searchQuery
    )
  );

  if (state.viewMode === 'focus') {
    return renderFocusView(part, filtered, (item) => renderSituationCard(part.id, item));
  }

  if (filtered.length === 0) {
    return `<div class="empty-state">По запросу ничего не найдено.</div>`;
  }

  return `<div class="cards-grid">${filtered.map((item) => renderSituationCard(part.id, item)).join('')}</div>`;
}

function renderQuestionsBody(part) {
  const flatFiltered = [];
  const filteredGroups = part.groups
    .map((group) => {
      const items = group.items.filter((item) =>
        matchesSearch([item.qEs, item.qHy, item.aEs, item.aHy], state.searchQuery)
      );
      items.forEach((item) => flatFiltered.push(item));
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);

  if (state.viewMode === 'focus') {
    return renderFocusView(part, flatFiltered, (item) => renderQuestionCard(part.id, item));
  }

  if (filteredGroups.length === 0) {
    return `<div class="empty-state">По запросу ничего не найдено.</div>`;
  }

  return filteredGroups
    .map(
      (group) => `
      <section class="group-block">
        ${
          part.groups.length > 1
            ? `<div class="group-header">
                <h3 class="group-title">${escapeHtml(group.titleEs)}</h3>
                <span aria-hidden="true">·</span>
                <span class="group-title-hy">${escapeHtml(group.titleHy)}</span>
              </div>`
            : ''
        }
        <div class="cards-grid">
          ${group.items.map((item) => renderQuestionCard(part.id, item)).join('')}
        </div>
      </section>
    `
    )
    .join('');
}

function renderDialoguesBody(part) {
  return part.dialogues
    .map((dialogue, dIdx) => {
      const turnsHtml = dialogue.turns
        .map((turn, tIdx) => {
          const base = `${part.id}:d:${dIdx}:t:${tIdx}`;
          const answerId = `${base}:ans`;
          const isOpen = !turn.isReply || state.openAnswers.has(answerId);

          return `
            <div class="turn ${turn.isReply ? 'is-reply' : ''}">
              <div class="turn-role">${escapeHtml(turn.role)}</div>
              <div class="turn-body">
                ${
                  isOpen
                    ? `
                      ${renderPhrase({
                        id: `${base}:line`,
                        es: turn.es,
                        hy: turn.hy,
                      })}
                      ${
                        turn.isReply
                          ? `<div>
                              <button
                                type="button"
                                class="link-reset"
                                data-action="toggle-answer"
                                data-id="${answerId}"
                              >Скрыть ответ</button>
                            </div>`
                          : ''
                      }
                    `
                    : `
                      <div class="turn-hidden-row">
                        <span class="turn-placeholder">Ответьте вслух, затем откройте пример ответа</span>
                        <button
                          type="button"
                          class="btn btn-answer"
                          data-action="toggle-answer"
                          data-id="${answerId}"
                        >Посмотреть ответ</button>
                      </div>
                    `
                }
              </div>
            </div>
          `;
        })
        .join('');

      return `
        <section class="dialogue-card">
          <div class="dialogue-header">
            <h3 class="dialogue-title">${escapeHtml(dialogue.titleEs)}</h3>
            <span class="section-title-hy">${escapeHtml(dialogue.titleHy)}</span>
          </div>
          <div class="dialogue-list">
            ${turnsHtml}
          </div>
        </section>
      `;
    })
    .join('');
}

function getOralDeck(part) {
  let cards = part.cards || [];
  let deckKey = part.id;

  if (part.topicTabs && part.topicTabs.length > 0) {
    const activeTabId = state.oralTopics[part.id] || part.topicTabs[0].id;
    const activeTab = part.topicTabs.find((t) => t.id === activeTabId) || part.topicTabs[0];
    cards = activeTab.cards;
    deckKey = `${part.id}:${activeTab.id}`;
  }

  const order = state.oralOrders[deckKey];
  const orderedCards = order
    ? order.map((origIdx) => ({ ...cards[origIdx], _origIdx: origIdx }))
    : cards.map((c, origIdx) => ({ ...c, _origIdx: origIdx }));

  return { deckKey, cards: orderedCards };
}

function renderOralBody(part) {
  const { deckKey, cards } = getOralDeck(part);
  let idx = state.focusIndices[deckKey] || 0;
  if (idx >= cards.length) idx = cards.length - 1;
  if (idx < 0) idx = 0;
  state.focusIndices[deckKey] = idx;

  const current = cards[idx];
  const qId = `${deckKey}:oral:${current._origIdx}:q`;
  const aId = `${deckKey}:oral:${current._origIdx}:a`;
  const ansToggleId = `${deckKey}:oral:${current._origIdx}:ans`;

  const isTrOpen = state.openTranslations.has(qId);
  const isAnsOpen = state.openAnswers.has(ansToggleId);

  const topicSwitcherHtml = part.topicTabs
    ? `<div class="topic-tabs" role="tablist" aria-label="Тема практики">
        ${part.topicTabs
          .map((tab) => {
            const activeTabId = state.oralTopics[part.id] || part.topicTabs[0].id;
            return `
              <button
                type="button"
                class="topic-tab ${activeTabId === tab.id ? 'is-active' : ''}"
                data-action="select-oral-topic"
                data-part="${part.id}"
                data-topic="${tab.id}"
              >${escapeHtml(tab.label)}</button>
            `;
          })
          .join('')}
      </div>`
    : '';

  return `
    ${topicSwitcherHtml}
    <section class="trainer-card">
      <div class="trainer-top">
        <div class="trainer-meta">
          <span>${escapeHtml(part.kicker || 'Práctica oral')}</span>
          <span aria-hidden="true">·</span>
          <span class="trainer-counter">${idx + 1} / ${cards.length}</span>
        </div>
        <button
          type="button"
          class="btn"
          data-action="shuffle-oral"
          data-deck="${deckKey}"
          data-total="${cards.length}"
        >Перемешать</button>
      </div>

      <div class="trainer-prompt">
        ${renderPhrase({
          id: qId,
          es: current.qEs,
          hy: current.qHy,
        })}
      </div>

      <div class="trainer-controls">
        <button
          type="button"
          class="btn"
          data-action="toggle-translation"
          data-id="${escapeHtml(qId)}"
        >${isTrOpen ? 'Скрыть перевод' : state.direction === 'es-hy' ? 'Հայերեն թարգմանություն' : 'Перевод на испанский'}</button>

        <button
          type="button"
          class="btn btn-answer ${isAnsOpen ? 'is-open' : ''}"
          data-action="toggle-answer"
          data-id="${ansToggleId}"
        >${isAnsOpen ? 'Скрыть ответ' : 'Посмотреть ответ'}</button>
      </div>

      ${
        isAnsOpen
          ? `<div class="answer-panel">
              <span class="field-label">Ejemplo de respuesta · Пример ответа</span>
              ${renderPhrase({
                id: aId,
                es: current.aEs,
                hy: current.aHy,
                showHint: true,
              })}
            </div>`
          : ''
      }

      <div class="trainer-nav">
        <button
          type="button"
          class="btn"
          data-action="focus-prev"
          data-part="${deckKey}"
          data-total="${cards.length}"
        >← Anterior</button>
        <button
          type="button"
          class="btn btn-primary"
          data-action="focus-next"
          data-part="${deckKey}"
          data-total="${cards.length}"
        >Siguiente →</button>
      </div>
    </section>

    ${
      part.tip
        ? `<div class="tip-box">
            <strong>Совет для практики:</strong> ${escapeHtml(part.tip)}
          </div>`
        : ''
    }
  `;
}

function renderPartBody(part) {
  if (part.type === 'situations') return renderSituationsBody(part);
  if (part.type === 'questions') return renderQuestionsBody(part);
  if (part.type === 'dialogues') return renderDialoguesBody(part);
  if (part.type === 'oral') return renderOralBody(part);
  return '';
}

function renderToolbar(part) {
  if (part.type === 'oral') return '';

  const { phraseIds, answerIds } = getPhraseIdsForPart(part);
  const allTrOpen = phraseIds.length > 0 && phraseIds.every((id) => state.openTranslations.has(id));
  const allAnsOpen = answerIds.length > 0 && answerIds.every((id) => state.openAnswers.has(id));
  const supportsSearchAndFocus = part.type === 'situations' || part.type === 'questions';

  return `
    <div class="toolbar">
      <div class="toolbar-group">
        ${
          supportsSearchAndFocus
            ? `
              <input
                type="search"
                class="search-input"
                id="part-search"
                value="${escapeHtml(state.searchQuery)}"
                placeholder="Поиск по испанскому или армянскому…"
                aria-label="Поиск по разделу"
              />
              <div class="segmented" role="group" aria-label="Режим отображения">
                <button
                  type="button"
                  class="segmented-btn ${state.viewMode === 'list' ? 'is-active' : ''}"
                  data-action="set-view-mode"
                  data-mode="list"
                >Список</button>
                <button
                  type="button"
                  class="segmented-btn ${state.viewMode === 'focus' ? 'is-active' : ''}"
                  data-action="set-view-mode"
                  data-mode="focus"
                >Карточки</button>
              </div>
            `
            : ''
        }
      </div>

      <div class="toolbar-group">
        <button
          type="button"
          class="btn"
          data-action="toggle-all-translations"
        >${allTrOpen ? 'Скрыть переводы' : 'Все переводы'}</button>
        ${
          answerIds.length > 0
            ? `<button
                type="button"
                class="btn"
                data-action="toggle-all-answers"
              >${allAnsOpen ? 'Скрыть все ответы' : 'Показать все ответы'}</button>`
            : ''
        }
      </div>
    </div>
  `;
}

function renderApp() {
  renderTopbar();

  const app = document.getElementById('app');
  if (!app) return;

  const lesson = getLesson();
  const part = getPart(lesson);

  app.innerHTML = `
    ${renderSidebar(lesson, part)}
    <div class="stage">
      <section class="lesson-header">
        <div class="lesson-meta">
          <span>Español ↔ Հայերեն</span>
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(lesson.titleHy)}</span>
        </div>
        <h1 class="lesson-title">${escapeHtml(lesson.titleEs)}</h1>
        <p class="lesson-subtitle">${escapeHtml(lesson.subtitle)}</p>
        <p class="lesson-intro">${escapeHtml(lesson.intro)}</p>
      </section>

      <section class="section-head">
        <div class="section-title-row">
          <h2 class="section-title">${escapeHtml(part.titleEs)}</h2>
          <span class="section-title-hy">${escapeHtml(part.titleHy)}</span>
        </div>
        ${part.intro ? `<p class="lesson-intro">${escapeHtml(part.intro)}</p>` : ''}
        ${renderToolbar(part)}
      </section>

      <div id="part-body">
        ${renderPartBody(part)}
      </div>
    </div>
  `;
}

function updatePartBodyOnly() {
  const container = document.getElementById('part-body');
  if (!container) {
    renderApp();
    return;
  }
  const part = getPart();
  container.innerHTML = renderPartBody(part);
}

function handleAction(target) {
  const action = target.dataset.action;
  if (!action) return;

  if (action === 'go-home') {
    state.lessonId = LESSONS[0].id;
    state.partId = LESSONS[0].parts[0].id;
    state.searchQuery = '';
    renderApp();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (action === 'select-nav') {
    state.lessonId = target.dataset.lesson;
    state.partId = target.dataset.part;
    state.searchQuery = '';
    renderApp();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (action === 'open-oral') {
    const lesson = getLesson();
    const oralPart = lesson.parts.find((p) => p.type === 'oral') || lesson.parts[lesson.parts.length - 1];
    state.partId = oralPart.id;
    state.searchQuery = '';
    renderApp();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (action === 'select-part') {
    state.partId = target.dataset.part;
    state.searchQuery = '';
    renderApp();
    return;
  }

  if (action === 'set-direction') {
    state.direction = target.dataset.dir;
    state.openTranslations.clear();
    renderApp();
    return;
  }

  if (action === 'set-view-mode') {
    state.viewMode = target.dataset.mode;
    renderApp();
    return;
  }

  if (action === 'speak') {
    speakSpanish(target.dataset.text || '');
    return;
  }

  if (action === 'toggle-translation') {
    const id = target.dataset.id;
    if (state.openTranslations.has(id)) {
      state.openTranslations.delete(id);
    } else {
      state.openTranslations.add(id);
    }
    renderApp();
    return;
  }

  if (action === 'toggle-answer') {
    const id = target.dataset.id;
    if (state.openAnswers.has(id)) {
      state.openAnswers.delete(id);
    } else {
      state.openAnswers.add(id);
    }
    renderApp();
    return;
  }

  if (action === 'toggle-done') {
    const id = target.dataset.id;
    if (state.doneItems.has(id)) {
      state.doneItems.delete(id);
    } else {
      state.doneItems.add(id);
    }
    saveDoneItems();
    renderApp();
    return;
  }

  if (action === 'reset-lesson-progress') {
    const ids = getAllTrackableItemIds(getLesson());
    ids.forEach((id) => state.doneItems.delete(id));
    saveDoneItems();
    renderApp();
    return;
  }

  if (action === 'toggle-all-translations') {
    const { phraseIds } = getPhraseIdsForPart(getPart());
    const allOpen = phraseIds.length > 0 && phraseIds.every((id) => state.openTranslations.has(id));
    if (allOpen) {
      phraseIds.forEach((id) => state.openTranslations.delete(id));
    } else {
      phraseIds.forEach((id) => state.openTranslations.add(id));
    }
    renderApp();
    return;
  }

  if (action === 'toggle-all-answers') {
    const { answerIds } = getPhraseIdsForPart(getPart());
    const allOpen = answerIds.length > 0 && answerIds.every((id) => state.openAnswers.has(id));
    if (allOpen) {
      answerIds.forEach((id) => state.openAnswers.delete(id));
    } else {
      answerIds.forEach((id) => state.openAnswers.add(id));
    }
    renderApp();
    return;
  }

  if (action === 'focus-prev' || action === 'focus-next') {
    const key = target.dataset.part;
    const total = Number(target.dataset.total) || 1;
    const current = state.focusIndices[key] || 0;
    const next =
      action === 'focus-next' ? (current + 1) % total : (current - 1 + total) % total;
    state.focusIndices[key] = next;
    renderApp();
    return;
  }

  if (action === 'select-oral-topic') {
    const partId = target.dataset.part;
    const topicId = target.dataset.topic;
    state.oralTopics[partId] = topicId;
    renderApp();
    return;
  }

  if (action === 'shuffle-oral') {
    const deckKey = target.dataset.deck;
    const total = Number(target.dataset.total) || 0;
    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    state.oralOrders[deckKey] = order;
    state.focusIndices[deckKey] = 0;
    renderApp();
    return;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
  if (!target) return;
  handleAction(target);
});

document.addEventListener('input', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.id === 'part-search') {
    state.searchQuery = event.target.value;
    state.focusIndices[state.partId] = 0;
    updatePartBodyOnly();
  }
});

renderApp();
