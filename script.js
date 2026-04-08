const EPSILON = "e";
const EMPTY_SET_LABEL = "{}";
const EPSILON_DISPLAY = "ε";

const sampleData = {
  states: "q0,q1,q2,q3",
  alphabet: "0,1",
  startState: "q0",
  finalStates: "q3",
  transitions: `q0,e=q1|q2
q1,0=q1
q1,1=q1|q3
q2,0=q2|q3
q2,1=q2
q3,0=
q3,1=`,
};

const elements = {
  topLayout: document.querySelector(".top-layout"),
  leftStack: document.querySelector(".left-stack"),
  inputPanel: document.querySelector(".input-panel"),
  summaryPanel: document.querySelector(".summary-panel"),
  builderSidePanel: document.querySelector(".builder-side-panel"),
  statesInput: document.getElementById("statesInput"),
  alphabetInput: document.getElementById("alphabetInput"),
  startStateInput: document.getElementById("startStateInput"),
  finalStatesInput: document.getElementById("finalStatesInput"),
  transitionsInput: document.getElementById("transitionsInput"),
  buildTransitionGridBtn: document.getElementById("buildTransitionGridBtn"),
  syncTransitionGridBtn: document.getElementById("syncTransitionGridBtn"),
  generateBtn: document.getElementById("generateBtn"),
  loadSampleBtn: document.getElementById("loadSampleBtn"),
  resetBtn: document.getElementById("resetBtn"),
  messageBox: document.getElementById("messageBox"),
  summaryCards: document.getElementById("summaryCards"),
  stateNamingGuide: document.getElementById("stateNamingGuide"),
  stepControlsBottom: document.getElementById("stepControlsBottom"),
  stepCompletionBar: document.getElementById("stepCompletionBar"),
  stepCompletionText: document.getElementById("stepCompletionText"),
  prevStepBtnComplete: document.getElementById("prevStepBtnComplete"),
  prevStepBtnBottom: document.getElementById("prevStepBtnBottom"),
  nextStepBtnBottom: document.getElementById("nextStepBtnBottom"),
  stepCounterBottom: document.getElementById("stepCounterBottom"),
  toggleAllStepsBtnBottom: document.getElementById("toggleAllStepsBtnBottom"),
  stepsContainer: document.getElementById("stepsContainer"),
  nfaGraph: document.getElementById("nfaGraph"),
  dfaGraph: document.getElementById("dfaGraph"),
  transitionGridContainer: document.getElementById("transitionGridContainer"),
  nfaTableContainer: document.getElementById("nfaTableContainer"),
  dfaTableContainer: document.getElementById("dfaTableContainer"),
};

const appState = {
  currentStepIndex: -1,
  currentSteps: [],
  currentFinalStates: [],
  currentNfa: null,
  currentDfa: null,
};

function applyResponsiveTopLayoutOrder() {
  const isNarrowLayout = window.matchMedia("(max-width: 1100px)").matches;
  const { topLayout, leftStack, inputPanel, summaryPanel, builderSidePanel } = elements;

  if (!topLayout || !leftStack || !inputPanel || !summaryPanel || !builderSidePanel) {
    return;
  }

  if (isNarrowLayout) {
    if (builderSidePanel.parentElement !== leftStack || inputPanel.nextElementSibling !== builderSidePanel) {
      leftStack.insertBefore(builderSidePanel, summaryPanel);
    }
    return;
  }

  if (inputPanel.parentElement !== leftStack) {
    leftStack.prepend(inputPanel);
  }

  if (summaryPanel.parentElement !== leftStack) {
    leftStack.appendChild(summaryPanel);
  }

  if (builderSidePanel.parentElement !== topLayout || leftStack.nextElementSibling !== builderSidePanel) {
    topLayout.insertBefore(builderSidePanel, leftStack.nextElementSibling);
  }
}

function splitCsv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function uniqueSorted(items) {
  return [...new Set(items)].sort();
}

function normalizeSymbol(symbol) {
  const value = symbol.trim().toLowerCase();
  if (value === "e" || value === "eps" || value === "epsilon") {
    return EPSILON;
  }
  return symbol.trim();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSymbol(symbol) {
  return symbol === EPSILON ? EPSILON_DISPLAY : symbol;
}

function formatSubset(states) {
  return states.length ? `{${states.join(", ")}}` : EMPTY_SET_LABEL;
}

function describeSubset(states) {
  return states.length ? formatSubset(states) : "Dead = {}";
}

function subsetKey(states) {
  return states.length ? states.join("|") : EMPTY_SET_LABEL;
}

function makeStateBadge(label, { isFinal = false, isSubset = false } = {}) {
  return `<span class="state-token ${isFinal ? "final" : ""} ${isSubset ? "subset" : ""}">${escapeHtml(label)}</span>`;
}

function describeDfaAlias(alias, subset) {
  return subset.length ? `${alias} = ${formatSubset(subset)}` : `${alias} = Dead = {}`;
}

function epsilonClosureOfStates(transitions, states) {
  const closure = new Set(states);
  const stack = [...states];

  while (stack.length) {
    const current = stack.pop();
    const epsilonTargets = transitions[current]?.[EPSILON] || [];

    epsilonTargets.forEach((target) => {
      if (!closure.has(target)) {
        closure.add(target);
        stack.push(target);
      }
    });
  }

  return uniqueSorted([...closure]);
}

function parseTransitions(raw, states, alphabet) {
  const transitionMap = {};

  states.forEach((state) => {
    transitionMap[state] = { [EPSILON]: [] };
    alphabet.forEach((symbol) => {
      transitionMap[state][symbol] = [];
    });
  });

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  lines.forEach((line, index) => {
    const parts = line.split("=");
    if (parts.length !== 2) {
      throw new Error(`Line ${index + 1}: use the format state,symbol=next1|next2`);
    }

    const [left, right] = parts;
    const leftParts = left.split(",");
    if (leftParts.length !== 2) {
      throw new Error(`Line ${index + 1}: left side must be state,symbol`);
    }

    const state = leftParts[0].trim();
    const symbol = normalizeSymbol(leftParts[1]);

    if (!states.includes(state)) {
      throw new Error(`Line ${index + 1}: unknown state "${state}"`);
    }

    if (symbol !== EPSILON && !alphabet.includes(symbol)) {
      throw new Error(`Line ${index + 1}: unknown symbol "${symbol}"`);
    }

    const targets = right.trim()
      ? uniqueSorted(right.split("|").map((item) => item.trim()).filter(Boolean))
      : [];

    targets.forEach((target) => {
      if (!states.includes(target)) {
        throw new Error(`Line ${index + 1}: unknown target state "${target}"`);
      }
    });

    transitionMap[state][symbol] = targets;
  });

  return transitionMap;
}

function parseNfaDefinition() {
  const states = uniqueSorted(splitCsv(elements.statesInput.value));
  const alphabet = uniqueSorted(splitCsv(elements.alphabetInput.value).map(normalizeSymbol));
  const startState = elements.startStateInput.value.trim();
  const finalStates = uniqueSorted(splitCsv(elements.finalStatesInput.value));

  if (!states.length) {
    throw new Error("Please enter at least one NFA state.");
  }

  if (!alphabet.length) {
    throw new Error("Please enter at least one input symbol.");
  }

  if (alphabet.includes(EPSILON)) {
    throw new Error('Do not include "e" in the alphabet. Epsilon transitions are entered only in the transition list.');
  }

  if (!startState) {
    throw new Error("Please enter a start state.");
  }

  if (!states.includes(startState)) {
    throw new Error(`The start state "${startState}" is not in the state list.`);
  }

  finalStates.forEach((state) => {
    if (!states.includes(state)) {
      throw new Error(`Final state "${state}" is not in the state list.`);
    }
  });

  const transitions = parseTransitions(elements.transitionsInput.value, states, alphabet);
  const closures = {};

  states.forEach((state) => {
    closures[state] = epsilonClosureOfStates(transitions, [state]);
  });

  return {
    states,
    alphabet,
    startState,
    finalStates,
    transitions,
    closures,
  };
}

function getBuilderSymbols() {
  const alphabet = uniqueSorted(splitCsv(elements.alphabetInput.value).map(normalizeSymbol))
    .filter((symbol) => symbol !== EPSILON);
  return [...alphabet, EPSILON];
}

function safeParsedTransitions(states, alphabet) {
  try {
    return parseTransitions(elements.transitionsInput.value, states, alphabet);
  } catch {
    return null;
  }
}

function collectCurrentGridValues() {
  const values = new Map();
  const inputs = elements.transitionGridContainer.querySelectorAll(".builder-input");

  inputs.forEach((input) => {
    const key = `${input.dataset.state}::${input.dataset.symbol}`;
    values.set(key, input.value.trim());
  });

  return values;
}

function createBuilderSelectOptions(states) {
  return [
    '<option value="">Select state</option>',
    ...states.map((state) => `<option value="${escapeHtml(state)}">${escapeHtml(state)}</option>`),
  ].join("");
}

function renderTransitionBuilder({ preserveExisting = true } = {}) {
  const states = uniqueSorted(splitCsv(elements.statesInput.value));
  const alphabet = uniqueSorted(splitCsv(elements.alphabetInput.value).map(normalizeSymbol))
    .filter((symbol) => symbol !== EPSILON);

  if (!states.length || !alphabet.length) {
    elements.transitionGridContainer.className = "table-wrap empty-state";
    elements.transitionGridContainer.textContent = "Build the grid after entering states and alphabet to fill transitions faster.";
    return;
  }

  const symbols = [...alphabet, EPSILON];
  const stateOptions = createBuilderSelectOptions(states);
  const existingGridValues = preserveExisting ? collectCurrentGridValues() : new Map();
  const transitionMap = safeParsedTransitions(states, alphabet);
  const headers = ["State", ...symbols.map((symbol) => symbol === EPSILON ? `${EPSILON_DISPLAY} (epsilon)` : `on ${escapeHtml(symbol)}`)];
  const rows = states.map((state) => `
    <tr>
      <td>${renderStateCell(state)}</td>
      ${symbols.map((symbol) => {
        const key = `${state}::${symbol}`;
        const value = existingGridValues.get(key) ?? transitionMap?.[state]?.[symbol]?.join(",") ?? "";
        return `
          <td>
            <div class="builder-cell">
              <div class="builder-select-row">
                <select class="builder-select" data-builder-select="${escapeHtml(key)}">${stateOptions}</select>
                <button class="builder-add-btn" type="button" data-builder-add="${escapeHtml(key)}">Add</button>
              </div>
              <input class="builder-input" data-state="${escapeHtml(state)}" data-symbol="${escapeHtml(symbol)}" value="${escapeHtml(value)}" placeholder="q1,q2">
            </div>
          </td>
        `;
      }).join("")}
    </tr>
  `).join("");

  elements.transitionGridContainer.className = "table-wrap";
  elements.transitionGridContainer.innerHTML = `
    <table>
      <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  elements.transitionGridContainer.querySelectorAll("[data-builder-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.builderAdd;
      const select = elements.transitionGridContainer.querySelector(`[data-builder-select="${CSS.escape(key)}"]`);
      const input = elements.transitionGridContainer.querySelector(`.builder-input[data-state="${CSS.escape(key.split("::")[0])}"][data-symbol="${CSS.escape(key.split("::")[1])}"]`);

      if (!select || !input || !select.value) {
        return;
      }

      const currentValues = input.value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      if (!currentValues.includes(select.value)) {
        currentValues.push(select.value);
      }

      input.value = uniqueSorted(currentValues).join(",");
      select.value = "";
    });
  });

  setMessage("Transition Builder refreshed from the current states and alphabet.", "success");
}

function syncTransitionGridToTextarea() {
  const inputs = [...elements.transitionGridContainer.querySelectorAll(".builder-input")];
  if (!inputs.length) {
    setMessage("Build the transition grid first.", "error");
    return;
  }

  const lines = inputs.map((input) => {
    const state = input.dataset.state;
    const symbol = input.dataset.symbol;
    const raw = input.value.trim();
    const targets = raw
      ? uniqueSorted(raw.split(",").map((item) => item.trim()).filter(Boolean)).join("|")
      : "";
    return `${state},${symbol}=${targets}`;
  });

  elements.transitionsInput.value = lines.join("\n");
  setMessage("Transitions updated from the builder grid.", "success");
}

function syncTransitionGridSilently() {
  const inputs = [...elements.transitionGridContainer.querySelectorAll(".builder-input")];
  if (!inputs.length) {
    return;
  }

  const lines = inputs.map((input) => {
    const state = input.dataset.state;
    const symbol = input.dataset.symbol;
    const raw = input.value.trim();
    const targets = raw
      ? uniqueSorted(raw.split(",").map((item) => item.trim()).filter(Boolean)).join("|")
      : "";
    return `${state},${symbol}=${targets}`;
  });

  elements.transitionsInput.value = lines.join("\n");
}

function aliasForIndex(index) {
  return `D${index}`;
}

function convertNfaToDfa(nfa) {
  const startSubset = epsilonClosureOfStates(nfa.transitions, [nfa.startState]);
  const startKey = subsetKey(startSubset);
  const queue = [startSubset];
  const queued = new Set([startKey]);
  const visited = new Set();
  const dfaStates = [];
  const dfaTransitions = {};
  const steps = [];
  const aliasByKey = new Map([[startKey, aliasForIndex(0)]]);

  while (queue.length) {
    const currentSubset = uniqueSorted(queue.shift());
    const currentKey = subsetKey(currentSubset);
    queued.delete(currentKey);

    if (visited.has(currentKey)) {
      continue;
    }

    if (!aliasByKey.has(currentKey)) {
      aliasByKey.set(currentKey, aliasForIndex(aliasByKey.size));
    }

    visited.add(currentKey);
    dfaStates.push(currentSubset);
    dfaTransitions[currentKey] = {};

    const transitionDetails = nfa.alphabet.map((symbol) => {
      const moveParts = currentSubset.map((state) => ({
        state,
        directTargets: nfa.transitions[state][symbol] || [],
      }));

      const moveSet = uniqueSorted(moveParts.flatMap((part) => part.directTargets));
      const closureParts = moveSet.map((state) => ({
        state,
        closure: nfa.closures[state],
      }));
      const nextSubset = uniqueSorted(closureParts.flatMap((part) => part.closure));
      const nextKey = subsetKey(nextSubset);

      if (!aliasByKey.has(nextKey)) {
        aliasByKey.set(nextKey, aliasForIndex(aliasByKey.size));
      }

      const isNewSubset = !visited.has(nextKey) && !queued.has(nextKey);
      dfaTransitions[currentKey][symbol] = nextSubset;

      if (isNewSubset) {
        queue.push(nextSubset);
        queued.add(nextKey);
      }

      return {
        symbol,
        moveParts,
        moveSet,
        closureParts,
        nextSubset,
        nextAlias: aliasByKey.get(nextKey),
        discovered: isNewSubset,
      };
    });

    steps.push({
      subset: currentSubset,
      alias: aliasByKey.get(currentKey),
      isAccepting: currentSubset.some((state) => nfa.finalStates.includes(state)),
      transitions: transitionDetails,
    });
  }

  const acceptingStates = dfaStates.filter((subset) =>
    subset.some((state) => nfa.finalStates.includes(state))
  );

  return {
    startSubset,
    dfaStates,
    dfaTransitions,
    acceptingStates,
    steps,
    aliasByKey,
  };
}

function setMessage(text, type = "") {
  elements.messageBox.textContent = text;
  elements.messageBox.className = `message-box ${type}`.trim();
}

function renderSummary(nfa, dfa) {
  elements.summaryCards.innerHTML = `
    <article class="summary-card">
      <span class="card-label">Start subset</span>
      <strong>${escapeHtml(describeDfaAlias(dfa.aliasByKey.get(subsetKey(dfa.startSubset)), dfa.startSubset))}</strong>
    </article>
    <article class="summary-card">
      <span class="card-label">E-closure of start</span>
      <strong>${escapeHtml(formatSubset(nfa.closures[nfa.startState]))}</strong>
    </article>
    <article class="summary-card">
      <span class="card-label">Reachable DFA states</span>
      <strong>${dfa.dfaStates.length}</strong>
    </article>
    <article class="summary-card">
      <span class="card-label">Accepting DFA states</span>
      <strong>${dfa.acceptingStates.length}</strong>
    </article>
  `;
}

function renderNamingGuide(dfa) {
  const cards = dfa.dfaStates.map((subset) => {
    const key = subsetKey(subset);
    const alias = dfa.aliasByKey.get(key);
    const isFinal = dfa.acceptingStates.some((state) => subsetKey(state) === key);
    return `
      <article class="state-guide-card">
        ${makeStateBadge(alias, { isFinal })}
        <p>Represents <code>${escapeHtml(describeSubset(subset))}</code></p>
      </article>
    `;
  }).join("");

  elements.stateNamingGuide.className = "state-guide";
  elements.stateNamingGuide.innerHTML = `
    <div class="state-guide-grid">${cards}</div>
  `;
}

function buildStepTable(step) {
  const rows = step.transitions.map((transition) => {
    const moveBreakdown = transition.moveParts.length
      ? transition.moveParts.map((part) => `${part.state} -> ${formatSubset(part.directTargets)}`).join("<br>")
      : EMPTY_SET_LABEL;

    const closureBreakdown = transition.closureParts.length
      ? transition.closureParts.map((part) => `e-closure(${part.state}) = ${formatSubset(part.closure)}`).join("<br>")
      : "No states to close";

    return `
      <tr>
        <td><strong>${escapeHtml(formatSymbol(transition.symbol))}</strong></td>
        <td><code>${moveBreakdown}</code></td>
        <td><code>${escapeHtml(formatSubset(transition.moveSet))}</code></td>
        <td><code>${closureBreakdown}</code></td>
        <td>${makeStateBadge(describeDfaAlias(transition.nextAlias, transition.nextSubset), { isSubset: true })}</td>
        <td>${transition.discovered ? "New DFA state discovered" : "Already known state"}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="step-math">
      <table>
        <thead>
          <tr>
            <th>Input</th>
            <th>Move from current subset</th>
            <th>Move result</th>
            <th>E-closure applied</th>
            <th>Next DFA state</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function createStepMarkup(step, finalStates, index, total) {
  const acceptingStates = step.subset.filter((state) => finalStates.includes(state));
  const acceptanceText = acceptingStates.length
    ? `This DFA state is accepting because the subset contains final NFA state(s): ${escapeHtml(acceptingStates.join(", "))}.`
    : "This DFA state is not accepting because none of the NFA states in the subset is final.";

  return `
    <article class="step-card">
      <div class="step-topline">
        <h3>Step ${index + 1} of ${total}</h3>
        ${makeStateBadge(describeDfaAlias(step.alias, step.subset), { isFinal: acceptingStates.length > 0, isSubset: true })}
      </div>
      <div class="step-body">
        <p>Current DFA state: <code>${escapeHtml(step.alias)}</code>, which represents the NFA subset <code>${escapeHtml(describeSubset(step.subset))}</code>.</p>
        <p>${acceptanceText}</p>
        <div class="formula-line">
          Construction rule: for each symbol, compute <code>move(${escapeHtml(step.alias)}, symbol)</code> and then take the <code>e-closure</code> (epsilon-closure) of every state reached.
        </div>
        ${buildStepTable(step)}
        <div class="step-note">
          Each newly discovered subset becomes a brand-new DFA state. The empty subset <code>{}</code> is included as a dead state so the DFA remains complete for every input symbol.
        </div>
      </div>
    </article>
  `;
}

function buildPartialDfaForStep(dfa, stepIndex) {
  if (stepIndex < 0) {
    return {
      ...dfa,
      dfaStates: [dfa.startSubset],
      dfaTransitions: {
        [subsetKey(dfa.startSubset)]: {},
      },
      acceptingStates: dfa.acceptingStates.filter(
        (subset) => subsetKey(subset) === subsetKey(dfa.startSubset)
      ),
    };
  }

  const processedSteps = dfa.steps.slice(0, stepIndex + 1);
  const knownKeys = new Set();
  const processedKeys = new Set();

  processedSteps.forEach((step) => {
    const currentKey = subsetKey(step.subset);
    knownKeys.add(currentKey);
    processedKeys.add(currentKey);
    step.transitions.forEach((transition) => {
      knownKeys.add(subsetKey(transition.nextSubset));
    });
  });

  const dfaStates = dfa.dfaStates.filter((subset) => knownKeys.has(subsetKey(subset)));
  const dfaTransitions = {};

  dfaStates.forEach((subset) => {
    const key = subsetKey(subset);
    dfaTransitions[key] = processedKeys.has(key)
      ? { ...(dfa.dfaTransitions[key] || {}) }
      : {};
  });

  return {
    ...dfa,
    dfaStates,
    dfaTransitions,
    acceptingStates: dfaStates.filter((subset) =>
      dfa.acceptingStates.some((candidate) => subsetKey(candidate) === subsetKey(subset))
    ),
  };
}

function updateStepView() {
  const steps = appState.currentSteps;
  if (!steps.length) {
    elements.stepControlsBottom.className = "step-controls hidden-controls step-controls-bottom";
    elements.stepCompletionBar.className = "step-controls hidden-controls step-controls-bottom";
    elements.stepsContainer.className = "steps-container empty-state";
    elements.stepsContainer.textContent = "No subset construction steps were generated.";
    return;
  }

  const index = Math.max(-1, Math.min(appState.currentStepIndex, steps.length - 1));
  appState.currentStepIndex = index;
  elements.stepControlsBottom.className = index === steps.length - 1
    ? "step-controls hidden-controls step-controls-bottom"
    : "step-controls step-controls-bottom";
  elements.stepCompletionBar.className = index === steps.length - 1
    ? "step-controls step-controls-bottom"
    : "step-controls hidden-controls step-controls-bottom";
  elements.toggleAllStepsBtnBottom.textContent = "Show All Steps";
  elements.toggleAllStepsBtnBottom.disabled = false;
  const counterText = index < 0
    ? `Step 0 of ${steps.length}`
    : `Step ${index + 1} of ${steps.length}`;
  elements.stepCounterBottom.textContent = counterText;
  elements.stepCompletionText.textContent = `Step ${steps.length} of ${steps.length} completed`;
  const prevDisabled = index <= 0;
  const nextDisabled = index === steps.length - 1;
  elements.prevStepBtnBottom.disabled = prevDisabled;
  elements.nextStepBtnBottom.disabled = nextDisabled;
  if (index < 0) {
    elements.stepsContainer.className = "steps-container";
    elements.stepsContainer.innerHTML = `
      <article class="step-card">
        <div class="step-topline">
          <h3>Ready To Start</h3>
          ${makeStateBadge(describeDfaAlias(appState.currentDfa.aliasByKey.get(subsetKey(appState.currentDfa.startSubset)), appState.currentDfa.startSubset), { isSubset: true })}
        </div>
        <div class="step-body">
          <p>The subset construction is initialized.</p>
          <p>Start DFA state: <code>${escapeHtml(appState.currentDfa.aliasByKey.get(subsetKey(appState.currentDfa.startSubset)))}</code> representing <code>${escapeHtml(describeSubset(appState.currentDfa.startSubset))}</code>.</p>
          <div class="step-note">Press <strong>Next</strong> to process the first subset and begin constructing DFA transitions step by step.</div>
        </div>
      </article>
    `;
  } else {
    elements.stepsContainer.className = "steps-container";
    elements.stepsContainer.innerHTML = steps
      .slice(0, index + 1)
      .map((step, currentIndex) =>
        createStepMarkup(step, appState.currentFinalStates, currentIndex, steps.length)
      )
      .join("");
  }

  if (appState.currentNfa && appState.currentDfa) {
    const partialDfa = buildPartialDfaForStep(appState.currentDfa, index);
    renderDfaTable(appState.currentNfa, partialDfa);
    renderAutomatonGraph(elements.dfaGraph, buildDfaGraphModel(appState.currentNfa, partialDfa));
  }
}

function renderSteps(nfa, dfa) {
  const steps = dfa.steps;
  const finalStates = nfa.finalStates;
  if (!steps.length) {
    appState.currentSteps = [];
    appState.currentFinalStates = [];
    appState.currentStepIndex = -1;
    appState.currentNfa = nfa;
    appState.currentDfa = dfa;
    updateStepView();
    return;
  }

  appState.currentSteps = steps;
  appState.currentFinalStates = finalStates;
  appState.currentStepIndex = -1;
  appState.currentNfa = nfa;
  appState.currentDfa = dfa;
  updateStepView();
}

function goToPreviousStep() {
  if (appState.currentStepIndex > -1) {
    appState.currentStepIndex -= 1;
    updateStepView();
  }
}

function goToNextStep() {
  if (appState.currentStepIndex < appState.currentSteps.length - 1) {
    appState.currentStepIndex += 1;
    updateStepView();
  }
}

function toggleAllStepsView() {
  if (!appState.currentSteps.length) {
    return;
  }

  appState.currentStepIndex = appState.currentSteps.length - 1;
  updateStepView();
}

function createTable(headers, rows, acceptingKeys = new Set()) {
  const headHtml = headers.map((header) => `<th>${header}</th>`).join("");
  const bodyHtml = rows.map((row) => `
    <tr class="${acceptingKeys.has(row.key) ? "accepting-row" : ""}">
      ${row.cells.map((cell) => `<td>${cell}</td>`).join("")}
    </tr>
  `).join("");

  return `
    <table>
      <thead><tr>${headHtml}</tr></thead>
      <tbody>${bodyHtml}</tbody>
    </table>
  `;
}

function renderStateCell(label, { isStart = false, isFinal = false, isSubset = false } = {}) {
  const stateContent = isFinal
    ? makeStateBadge(label, { isFinal, isSubset })
    : `<span>${escapeHtml(label)}</span>`;

  return `
    <div class="state-cell">
      ${isStart ? '<span class="start-marker">-&gt;</span>' : ""}
      ${stateContent}
    </div>
  `;
}

function renderNfaTable(nfa) {
  const hasEpsilonTransitions = nfa.states.some((state) => (nfa.transitions[state][EPSILON] || []).length > 0);
  const headers = [
    "State",
    ...nfa.alphabet.map((symbol) => `on ${escapeHtml(symbol)}`),
    ...(hasEpsilonTransitions ? ["e"] : []),
  ];
  const rows = nfa.states.map((state) => ({
    key: state,
    cells: [
      renderStateCell(state, { isStart: state === nfa.startState, isFinal: nfa.finalStates.includes(state) }),
      ...nfa.alphabet.map((symbol) => escapeHtml(formatSubset(nfa.transitions[state][symbol] || []))),
      ...(hasEpsilonTransitions ? [escapeHtml(formatSubset(nfa.transitions[state][EPSILON] || []))] : []),
    ],
  }));

  elements.nfaTableContainer.className = "table-wrap";
  elements.nfaTableContainer.innerHTML = createTable(headers, rows, new Set(nfa.finalStates));
}

function renderDfaTable(nfa, dfa) {
  const acceptingKeys = new Set(dfa.acceptingStates.map((subset) => subsetKey(subset)));
  const headers = ["DFA State", "Subset", ...nfa.alphabet.map((symbol) => `on ${escapeHtml(symbol)}`)];
  const rows = dfa.dfaStates.map((subset) => {
    const key = subsetKey(subset);
    return {
      key,
      cells: [
        renderStateCell(dfa.aliasByKey.get(key), {
          isStart: key === subsetKey(dfa.startSubset),
          isFinal: acceptingKeys.has(key),
        }),
        `<code>${escapeHtml(describeSubset(subset))}</code>`,
        ...nfa.alphabet.map((symbol) => {
          const nextSubset = dfa.dfaTransitions[key]?.[symbol];
          if (!nextSubset) {
            return "<small>Not explored yet</small>";
          }
          const nextKey = subsetKey(nextSubset);
          return `<span>${escapeHtml(dfa.aliasByKey.get(nextKey))}</span><br><small>${escapeHtml(describeSubset(nextSubset))}</small>`;
        }),
      ],
    };
  });

  elements.dfaTableContainer.className = "table-wrap";
  elements.dfaTableContainer.innerHTML = createTable(headers, rows, acceptingKeys);
}

function breadthLevels(states, transitions, symbols, startState) {
  const levels = new Map([[startState, 0]]);
  const queue = [startState];

  while (queue.length) {
    const current = queue.shift();
    const currentLevel = levels.get(current);

    symbols.forEach((symbol) => {
      (transitions[current]?.[symbol] || []).forEach((target) => {
        if (!levels.has(target)) {
          levels.set(target, currentLevel + 1);
          queue.push(target);
        }
      });
    });
  }

  let fallbackLevel = Math.max(0, ...levels.values());
  states.forEach((state) => {
    if (!levels.has(state)) {
      fallbackLevel += 1;
      levels.set(state, fallbackLevel);
    }
  });

  return levels;
}

function computeLayeredPositions(automaton, width, height) {
  const levels = breadthLevels(
    automaton.states,
    automaton.transitions,
    automaton.symbols,
    automaton.startState
  );

  const maxLevel = Math.max(...levels.values(), 0);
  const layerGroups = Array.from({ length: maxLevel + 1 }, () => []);
  automaton.states.forEach((state) => {
    layerGroups[levels.get(state)].push(state);
  });

  layerGroups.forEach((group) => group.sort());
  const positions = new Map();
  const leftPadding = 130;
  const rightPadding = 130;
  const topPadding = 148;
  const bottomPadding = 120;

  layerGroups.forEach((group, level) => {
    const x = maxLevel === 0
      ? width / 2
      : leftPadding + ((width - leftPadding - rightPadding) * level) / maxLevel;
    const usableHeight = Math.max(height - topPadding - bottomPadding, (group.length - 1) * 220);
    const gap = group.length <= 1 ? 0 : usableHeight / (group.length - 1);

    group.forEach((state, index) => {
      const y = group.length === 1 ? height / 2 : topPadding + gap * index;
      positions.set(state, { x, y, level });
    });
  });

  return positions;
}

function computeLinearPositions(states, width, height) {
  const positions = new Map();
  const leftPadding = 120;
  const rightPadding = 120;
  const y = Math.max(132, height * 0.56);
  const usableWidth = width - leftPadding - rightPadding;
  const gap = states.length <= 1 ? 0 : usableWidth / (states.length - 1);

  states.forEach((state, index) => {
    positions.set(state, {
      x: leftPadding + (gap * index),
      y,
      level: index,
      index,
    });
  });

  return positions;
}

function hasReverseEdge(edgeMap, from, to) {
  return edgeMap.has(`${to}->${from}`) && from !== to;
}

function labelBoxWidth(label) {
  return Math.max(44, (label.length * 7) + 20);
}

function shouldCurvePair(from, to, edgeMap) {
  return hasReverseEdge(edgeMap, from, to);
}

function pairCurveDirection(from, to) {
  return from.localeCompare(to) <= 0 ? -1 : 1;
}

function edgeLabelAnchor(startX, startY, endX, endY, curveX, curveY, isPaired, curveDirection) {
  if (!isPaired) {
    return {
      x: ((startX + (2 * curveX) + endX) / 4),
      y: ((startY + (2 * curveY) + endY) / 4) + (curveY < ((startY + endY) / 2) ? -12 : 14),
    };
  }

  const towardTarget = 0.58;
  const baseX = startX + ((endX - startX) * towardTarget);
  const baseY = startY + ((endY - startY) * towardTarget);
  const offsetX = (curveX - ((startX + endX) / 2)) * 0.55;
  const offsetY = (curveY - ((startY + endY) / 2)) * 0.55;

  return {
    x: baseX + offsetX,
    y: baseY + offsetY - (curveDirection * 18),
  };
}

function quadraticPoint(startX, startY, curveX, curveY, endX, endY, t) {
  const inverse = 1 - t;
  return {
    x: (inverse * inverse * startX) + (2 * inverse * t * curveX) + (t * t * endX),
    y: (inverse * inverse * startY) + (2 * inverse * t * curveY) + (t * t * endY),
  };
}

function buildLinearEdgeGeometry(fromPos, toPos, isPaired) {
  const dx = toPos.x - fromPos.x;
  const direction = Math.sign(dx) || 1;
  const startX = fromPos.x + (direction * 34);
  const startY = fromPos.y;
  const endX = toPos.x - (direction * 34);
  const endY = toPos.y;
  const span = Math.abs((toPos.index ?? toPos.level) - (fromPos.index ?? fromPos.level));
  const isForward = dx > 0;
  const curveX = (startX + endX) / 2;
  let curveY = startY;

  if (isPaired && span === 1) {
    curveY += isForward ? -126 : 110;
  } else if (span <= 1) {
    curveY += isForward ? -42 : 52;
  } else if (span === 2) {
    curveY += isForward ? -184 : 214;
  } else {
    curveY += isForward ? -(150 + (span * 36)) : (220 + (span * 64));
  }

  const labelT = isPaired && span === 1
    ? (isForward ? 0.30 : 0.70)
    : (isForward ? 0.60 : 0.40);
  const labelPoint = quadraticPoint(
    startX,
    startY,
    curveX,
    curveY,
    endX,
    endY,
    labelT
  );

  return {
    startX,
    startY,
    endX,
    endY,
    curveX,
    curveY,
    labelX: labelPoint.x + (isPaired && span === 1 ? (isForward ? -8 : 8) : (isForward ? 0 : -8)),
    labelY: labelPoint.y + (curveY < startY ? -8 : 16),
  };
}

function buildSourceSpacingMap(edgeMap) {
  const spacingMap = new Map();

  [...edgeMap.keys()].forEach((edgeKey) => {
    const [from, to] = edgeKey.split("->");
    if (from === to) {
      return;
    }

    if (!spacingMap.has(from)) {
      spacingMap.set(from, []);
    }
    spacingMap.get(from).push(to);
  });

  spacingMap.forEach((targets, from) => {
    spacingMap.set(from, uniqueSorted(targets));
  });

  return spacingMap;
}

function buildTargetSpacingMap(edgeMap) {
  const spacingMap = new Map();

  [...edgeMap.keys()].forEach((edgeKey) => {
    const [from, to] = edgeKey.split("->");
    if (from === to) {
      return;
    }

    if (!spacingMap.has(to)) {
      spacingMap.set(to, []);
    }
    spacingMap.get(to).push(from);
  });

  spacingMap.forEach((sources, to) => {
    spacingMap.set(to, uniqueSorted(sources));
  });

  return spacingMap;
}

function renderAutomatonGraph(container, automaton) {
  const width = automaton.layout === "layered"
    ? Math.max(720, automaton.states.length * 210)
    : Math.max(920, automaton.states.length * 280);
  const height = automaton.layout === "layered"
    ? Math.max(620, automaton.states.length * 170)
    : Math.max(420, automaton.states.length * 130);
  const positions = automaton.layout === "linear"
    ? computeLinearPositions(automaton.states, width, height)
    : computeLayeredPositions(automaton, width, height);
  const edgeMap = new Map();

  automaton.states.forEach((state) => {
    automaton.symbols.forEach((symbol) => {
      (automaton.transitions[state][symbol] || []).forEach((target) => {
        const key = `${state}->${target}`;
        if (!edgeMap.has(key)) {
          edgeMap.set(key, []);
        }
        edgeMap.get(key).push(symbol);
      });
    });
  });
  const sourceSpacingMap = buildSourceSpacingMap(edgeMap);
  const targetSpacingMap = buildTargetSpacingMap(edgeMap);

  const defs = `
    <defs>
      <marker id="${container.id}-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,6 L9,3 z" fill="rgba(43, 29, 18, 0.78)"></path>
      </marker>
    </defs>
  `;

  const edges = [...edgeMap.entries()].map(([edgeKey, symbols]) => {
    const [from, to] = edgeKey.split("->");
    const fromPos = positions.get(from);
    const toPos = positions.get(to);
    const label = uniqueSorted(symbols.map(formatSymbol)).join(", ");
    const labelWidth = labelBoxWidth(label);

    if (from === to) {
      const loopTop = fromPos.y - 86;
      return `
        <path class="graph-edge" d="M ${fromPos.x - 18} ${fromPos.y - 30} C ${fromPos.x - 60} ${fromPos.y - 122}, ${fromPos.x + 60} ${fromPos.y - 122}, ${fromPos.x + 18} ${fromPos.y - 30}" marker-end="url(#${container.id}-arrow)"></path>
        <rect class="graph-edge-label-bg" x="${fromPos.x - (labelWidth / 2)}" y="${loopTop - 18}" rx="8" width="${labelWidth}" height="24"></rect>
        <text class="graph-label" x="${fromPos.x}" y="${loopTop - 2}" text-anchor="middle">${escapeHtml(label)}</text>
      `;
    }

    const isPaired = shouldCurvePair(from, to, edgeMap);
    const sourceTargets = sourceSpacingMap.get(from) || [];
    const sourceIndex = sourceTargets.indexOf(to);
    const sourceOffset = sourceTargets.length > 1
      ? (sourceIndex - ((sourceTargets.length - 1) / 2))
      : 0;
    const targetSources = targetSpacingMap.get(to) || [];
    const targetIndex = targetSources.indexOf(from);
    const targetOffset = targetSources.length > 1
      ? (targetIndex - ((targetSources.length - 1) / 2))
      : 0;
    let startX;
    let startY;
    let endX;
    let endY;
    let curveX;
    let curveY;
    let labelX;
    let labelY;

    if (automaton.layout === "linear") {
      const geometry = buildLinearEdgeGeometry(fromPos, toPos, isPaired);
      startX = geometry.startX;
      startY = geometry.startY;
      endX = geometry.endX;
      endY = geometry.endY;
      curveX = geometry.curveX;
      curveY = geometry.curveY + (sourceOffset * 34);
      labelX = geometry.labelX;
      labelY = geometry.labelY + (sourceOffset * 26);
    } else {
      const dx = toPos.x - fromPos.x;
      const dy = toPos.y - fromPos.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const normX = dx / distance;
      const normY = dy / distance;
      startX = fromPos.x + (normX * 34);
      startY = fromPos.y + (normY * 34);
      endX = toPos.x - (normX * 34);
      endY = toPos.y - (normY * 34);
      const span = Math.abs((toPos.level ?? 0) - (fromPos.level ?? 0));
      const curveDirection = isPaired ? pairCurveDirection(from, to) : 1;
      const curveStrength = isPaired ? Math.max(150, 150 + (span * 16)) : Math.max(54, 56 + (span * 18));
      const laneOffset = (sourceOffset * 34) + (targetOffset * 26);
      curveX = ((startX + endX) / 2) - (normY * curveStrength * curveDirection);
      curveY = ((startY + endY) / 2) + (normX * curveStrength * curveDirection) + laneOffset;
      const labelPoint = edgeLabelAnchor(
        startX,
        startY,
        endX,
        endY,
        curveX,
        curveY,
        isPaired,
        curveDirection
      );
      labelX = labelPoint.x + (targetOffset * 8);
      labelY = labelPoint.y + (sourceOffset * 20) + (targetOffset * 10);
    }

    return `
      <path class="graph-edge" d="M ${startX} ${startY} Q ${curveX} ${curveY} ${endX} ${endY}" marker-end="url(#${container.id}-arrow)"></path>
      <rect class="graph-edge-label-bg" x="${labelX - (labelWidth / 2)}" y="${labelY - 14}" rx="8" width="${labelWidth}" height="24"></rect>
      <text class="graph-label" x="${labelX}" y="${labelY + 2}" text-anchor="middle">${escapeHtml(label)}</text>
    `;
  }).join("");

  const startPos = positions.get(automaton.startState);
  const startArrow = startPos
    ? `<path class="graph-edge" d="M ${startPos.x - 108} ${startPos.y} L ${startPos.x - 40} ${startPos.y}" marker-end="url(#${container.id}-arrow)"></path>`
    : "";

  const nodes = automaton.states.map((state) => {
    const pos = positions.get(state);
    const isAccepting = automaton.finalStates.includes(state);
    const isStart = state === automaton.startState;

    return `
      <g>
        <circle class="graph-node ${isAccepting ? "accepting" : ""} ${isStart ? "active" : ""}" cx="${pos.x}" cy="${pos.y}" r="32"></circle>
        ${isAccepting ? `<circle class="graph-node-inner accepting" cx="${pos.x}" cy="${pos.y}" r="24"></circle>` : ""}
        <text class="graph-label" x="${pos.x}" y="${pos.y + 1}" text-anchor="middle">${escapeHtml(automaton.nodeMeta?.[state]?.label || state)}</text>
        ${automaton.nodeMeta?.[state]?.subtitle ? `<text class="graph-subtitle" x="${pos.x}" y="${pos.y + 15}" text-anchor="middle">${escapeHtml(automaton.nodeMeta[state].subtitle)}</text>` : ""}
      </g>
    `;
  }).join("");

  container.className = "graph-canvas";
  container.style.minHeight = `${Math.max(180, height + 26)}px`;
  container.innerHTML = `
    <p class="graph-title">${escapeHtml(automaton.description)}</p>
    <svg class="graph-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Automaton graph">
      ${defs}
      ${startArrow}
      ${edges}
      ${nodes}
    </svg>
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch start"></span> Start state arrow points to the initial state</span>
      <span class="legend-item"><span class="legend-swatch accepting"></span> Double circle means accepting/final state</span>
    </div>
    <div class="edge-note">Every DFA state shows one outgoing transition for each input symbol. If no NFA state is reachable, the transition goes to the dead state.</div>
  `;
}

function buildNfaGraphModel(nfa) {
  const useLinearLayout = nfa.states.length <= 3;

  return {
    states: nfa.states,
    symbols: [EPSILON, ...nfa.alphabet],
    transitions: nfa.transitions,
    startState: nfa.startState,
    finalStates: nfa.finalStates,
    nodeMeta: Object.fromEntries(nfa.states.map((state) => [state, { label: state }])),
    layout: useLinearLayout ? "linear" : "layered",
    description: useLinearLayout
      ? "NFA graph shown first. Small NFAs are arranged left to right so transitions and labels stay clearer."
      : "NFA graph shown first. States are arranged in levels to keep the original nondeterministic transitions easier to read.",
  };
}

function buildDfaGraphModel(nfa, dfa) {
  const transitions = {};
  const states = [];
  const finalStates = [];
  const nodeMeta = {};

  dfa.dfaStates.forEach((subset) => {
    const key = subsetKey(subset);
    const alias = dfa.aliasByKey.get(key);
    states.push(alias);
    transitions[alias] = {};
    nodeMeta[alias] = {
      label: alias,
      subtitle: subset.length ? formatSubset(subset) : "dead",
    };

    if (dfa.acceptingStates.some((candidate) => subsetKey(candidate) === key)) {
      finalStates.push(alias);
    }

    nfa.alphabet.forEach((symbol) => {
      const nextSubset = dfa.dfaTransitions[key]?.[symbol];
      if (!nextSubset) {
        transitions[alias][symbol] = [];
        return;
      }
      const nextAlias = dfa.aliasByKey.get(subsetKey(nextSubset));
      transitions[alias][symbol] = nextAlias ? [nextAlias] : [];
    });
  });

  return {
    states,
    symbols: nfa.alphabet,
    transitions,
    startState: dfa.aliasByKey.get(subsetKey(dfa.startSubset)),
    finalStates,
    nodeMeta,
    layout: "linear",
    description: "DFA graph produced by subset construction. Each node consumes every input symbol. The empty subset is shown as a dead state.",
  };
}

function clearOutputs() {
  elements.summaryCards.innerHTML = `
    <article class="summary-card">
      <span class="card-label">Start subset</span>
      <strong>Not generated yet</strong>
    </article>
    <article class="summary-card">
      <span class="card-label">E-closure of start</span>
      <strong>0</strong>
    </article>
    <article class="summary-card">
      <span class="card-label">Reachable DFA states</span>
      <strong>0</strong>
    </article>
    <article class="summary-card">
      <span class="card-label">Accepting DFA states</span>
      <strong>0</strong>
    </article>
  `;
  elements.stateNamingGuide.className = "state-guide empty-state";
  elements.stateNamingGuide.textContent = "Generate the DFA to see how each subset is renamed as a clean DFA state such as D0, D1, and D2.";
  appState.currentSteps = [];
  appState.currentFinalStates = [];
  appState.currentStepIndex = -1;
  appState.currentNfa = null;
  appState.currentDfa = null;
  elements.stepControlsBottom.className = "step-controls hidden-controls step-controls-bottom";
  elements.stepCompletionBar.className = "step-controls hidden-controls step-controls-bottom";
  elements.stepCounterBottom.textContent = "Step 0 of 0";
  elements.stepCompletionText.textContent = "Step 0 of 0 completed";
  elements.stepsContainer.className = "steps-container empty-state";
  elements.stepsContainer.textContent = "Generate the DFA to see each new subset, each move result, the e-closure applied, and the final DFA transition created.";
  elements.nfaGraph.className = "graph-canvas empty-state";
  elements.nfaGraph.style.minHeight = "";
  elements.nfaGraph.textContent = "The NFA graph will appear here.";
  elements.dfaGraph.className = "graph-canvas empty-state";
  elements.dfaGraph.style.minHeight = "";
  elements.dfaGraph.textContent = "The DFA graph will appear here after construction.";
  elements.nfaTableContainer.className = "table-wrap empty-state";
  elements.nfaTableContainer.textContent = "The parsed NFA transition table will appear here.";
  elements.dfaTableContainer.className = "table-wrap empty-state";
  elements.dfaTableContainer.textContent = "The generated DFA transition table will appear here.";
  elements.transitionGridContainer.className = "table-wrap empty-state";
  elements.transitionGridContainer.textContent = "Build the grid after entering states and alphabet to fill transitions faster.";
}

function loadSample() {
  elements.statesInput.value = sampleData.states;
  elements.alphabetInput.value = sampleData.alphabet;
  elements.startStateInput.value = sampleData.startState;
  elements.finalStatesInput.value = sampleData.finalStates;
  elements.transitionsInput.value = sampleData.transitions;
  renderTransitionBuilder({ preserveExisting: false });
  setMessage("Sample NFA with epsilon transitions loaded.", "success");
}

function resetForm() {
  elements.statesInput.value = "";
  elements.alphabetInput.value = "";
  elements.startStateInput.value = "";
  elements.finalStatesInput.value = "";
  elements.transitionsInput.value = "";
  clearOutputs();
  setMessage("Inputs cleared.", "success");
}

function generate() {
  try {
    syncTransitionGridSilently();
    const nfa = parseNfaDefinition();
    const dfa = convertNfaToDfa(nfa);

    renderSummary(nfa, dfa);
    renderNamingGuide(dfa);
    renderSteps(nfa, dfa);
    renderNfaTable(nfa);
    renderAutomatonGraph(elements.nfaGraph, buildNfaGraphModel(nfa));

    setMessage(`DFA generated successfully. The construction created ${dfa.dfaStates.length} reachable DFA states and labeled them clearly as D0, D1, D2, ...`, "success");
  } catch (error) {
    clearOutputs();
    setMessage(error.message, "error");
  }
}

elements.generateBtn.addEventListener("click", generate);
elements.loadSampleBtn.addEventListener("click", loadSample);
elements.resetBtn.addEventListener("click", resetForm);
elements.prevStepBtnComplete.addEventListener("click", goToPreviousStep);
elements.prevStepBtnBottom.addEventListener("click", goToPreviousStep);
elements.nextStepBtnBottom.addEventListener("click", goToNextStep);
elements.toggleAllStepsBtnBottom.addEventListener("click", toggleAllStepsView);
elements.buildTransitionGridBtn.addEventListener("click", renderTransitionBuilder);
elements.syncTransitionGridBtn.addEventListener("click", syncTransitionGridToTextarea);
elements.statesInput.addEventListener("input", renderTransitionBuilder);
elements.alphabetInput.addEventListener("input", renderTransitionBuilder);
window.addEventListener("resize", applyResponsiveTopLayoutOrder);

applyResponsiveTopLayoutOrder();
loadSample();
generate();
