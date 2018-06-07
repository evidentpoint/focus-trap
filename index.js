var tabbable = require('tabbable');

var listeningFocusTrap = null;

function focusTrap(element, userOptions) {
  var tabbableNodes = [];
  var firstTabbableNode = null;
  var lastTabbableNode = null;
  var nodeFocusedBeforeActivation = null;
  var active = false;
  var paused = false;
  var tabEvent = null;
  var hadEmptyTabbableNodes = true;

  var container = (typeof element === 'string')
    ? document.querySelector(element)
    : element;

  var config = userOptions || {};
  config.returnFocusOnDeactivate = (userOptions && userOptions.returnFocusOnDeactivate !== undefined)
    ? userOptions.returnFocusOnDeactivate
    : true;
  config.escapeDeactivates = (userOptions && userOptions.escapeDeactivates !== undefined)
    ? userOptions.escapeDeactivates
    : true;
  config.ignoreClick = (userOptions && userOptions.ignoreClick !== undefined)
    ? userOptions.ignoreClick
    : false;
  config.extraTabbaleNodes = (userOptions && userOptions.extraTabbaleNodes !== undefined)
    ? userOptions.extraTabbaleNodes
    : [];

  var trap = {
    activate: activate,
    deactivate: deactivate,
    pause: pause,
    unpause: unpause,
  };

  return trap;

  function activate(activateOptions) {
    if (active) return;

    var defaultedActivateOptions = {
      onActivate: (activateOptions && activateOptions.onActivate !== undefined)
        ? activateOptions.onActivate
        : config.onActivate,
    };

    active = true;
    paused = false;
    nodeFocusedBeforeActivation = document.activeElement;

    if (defaultedActivateOptions.onActivate) {
      defaultedActivateOptions.onActivate();
    }

    addListeners();
    return trap;
  }

  function deactivate(deactivateOptions) {
    if (!active) return;

    var defaultedDeactivateOptions = {
      returnFocus: (deactivateOptions && deactivateOptions.returnFocus !== undefined)
        ? deactivateOptions.returnFocus
        : config.returnFocusOnDeactivate,
      onDeactivate: (deactivateOptions && deactivateOptions.onDeactivate !== undefined)
        ? deactivateOptions.onDeactivate
        : config.onDeactivate,
      customizeFocusReturn: (deactivateOptions && deactivateOptions.customizeFocusReturn !== undefined)
        ? deactivateOptions.customizeFocusReturn
        : undefined
    };

    removeListeners();

    if (defaultedDeactivateOptions.onDeactivate) {
      defaultedDeactivateOptions.onDeactivate();
    }

    if (defaultedDeactivateOptions.returnFocus) {
      if (defaultedDeactivateOptions.customizeFocusReturn) {
          setTimeout(function () {
              tryFocus(defaultedDeactivateOptions.customizeFocusReturn);
          }, 0);
      } else {
          setTimeout(function () {
              tryFocus(nodeFocusedBeforeActivation);
          }, 0);
      }
    }

    active = false;
    paused = false;
    return this;
  }

  function pause() {
    if (paused || !active) return;
    paused = true;
    removeListeners();
  }

  function unpause(nodeToFocus) {
    if (!paused || !active) return;
    paused = false;
    addListeners(nodeToFocus);
  }

  function addListeners(nodeToFocus) {
    if (!active) return;

    // There can be only one listening focus trap at a time
    if (listeningFocusTrap) {
      listeningFocusTrap.pause();
    }
    listeningFocusTrap = trap;

    updateTabbableNodes();
    if (nodeToFocus) {
    	tryFocus(nodeToFocus);
    } else {
    	tryFocus(firstFocusNode());
    }
    document.addEventListener('focus', checkFocus, true);
    document.addEventListener('keydown', checkKey, true);

    if (!config.ignoreClick) {
      document.addEventListener('click', checkClick, true);
      document.addEventListener('mousedown', checkPointerDown, true);
      document.addEventListener('touchstart', checkPointerDown, true);
    }

    return trap;
  }

  function removeListeners() {
    if (!active || listeningFocusTrap !== trap) return;

    document.removeEventListener('focus', checkFocus, true);
    document.removeEventListener('keydown', checkKey, true);

    if (!config.ignoreClick) {
      document.removeEventListener('click', checkClick, true);
      document.removeEventListener('mousedown', checkPointerDown, true);
      document.removeEventListener('touchstart', checkPointerDown, true);
    }

    listeningFocusTrap = null;

    return trap;
  }

  function getNodeForOption(optionName) {
    var optionValue = config[optionName];
    var node = optionValue;
    if (!optionValue) {
      return null;
    }
    if (typeof optionValue === 'string') {
      node = document.querySelector(optionValue);
      if (!node) {
        throw new Error('`' + optionName + '` refers to no known node');
      }
    }
    if (typeof optionValue === 'function') {
      node = optionValue();
      if (!node) {
        throw new Error('`' + optionName + '` did not return a node');
      }
    }
    return node;
  }

  function firstFocusNode() {
    var node;
    if (getNodeForOption('initialFocus') !== null) {
      node = getNodeForOption('initialFocus');
    } else if (!hadEmptyTabbableNodes && isNodeInScope(document.activeElement)) {
      node = document.activeElement;
    } else {
      node = tabbableNodes[0] || getNodeForOption('fallbackFocus');
    }

    if (!node) {
      throw new Error('You can\'t have a focus-trap without at least one focusable element');
    }

    return node;
  }

  function isNodeInScope(node) {
    return tabbableNodes.indexOf(node) >= 0;
  }

  // This needs to be done on mousedown and touchstart instead of click
  // so that it precedes the focus event
  function checkPointerDown(e) {
    if (config.clickOutsideDeactivates && !container.contains(e.target)) {
      deactivate({ returnFocus: false });
    }
  }

  function checkClick(e) {
    if (config.clickOutsideDeactivates) return;
    if (container.contains(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function checkFocus(e) {
    if (isNodeInScope(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Checking for a blur method here resolves a Firefox issue (#15)
    if (typeof e.target.blur === 'function') e.target.blur();

    if (tabEvent) {
      readjustFocus(tabEvent);
    }
  }

  function checkKey(e) {
    if (e.key === 'Tab' || e.keyCode === 9) {
      handleTab(e);
    }

    if (config.escapeDeactivates !== false && isEscapeEvent(e)) {
      deactivate();
    }
  }

  function handleTab(e) {
    updateTabbableNodes();

    if (e.target.hasAttribute('tabindex') && Number(e.target.getAttribute('tabindex')) < 0) {
      return tabEvent = e;
    }

    e.preventDefault();
    var currentFocusIndex = tabbableNodes.indexOf(e.target);

    if (e.shiftKey) {
      if (e.target === firstTabbableNode || tabbableNodes.indexOf(e.target) === -1) {
        return tryFocus(lastTabbableNode);
      }
      return tryFocus(nextTabbableNode(currentFocusIndex, -1));
    }

    if (e.target === lastTabbableNode) return tryFocus(firstTabbableNode);

    tryFocus(nextTabbableNode(currentFocusIndex, 1));
  }

  function nextTabbableNode(currentFocusIndex, increment) {
    var currNode = tabbableNodes[currentFocusIndex];
    if (currNode.type !== 'radio') {
      return tabbaleNodeWithRadioAdjustment(currentFocusIndex + increment, increment);
    }

    var nextNode;
    for (var i = currentFocusIndex + increment; i < tabbableNodes.length; i = i + increment) {
      nextNode = tabbableNodes[i];
      if (nextNode.type !== 'radio') {
        return nextNode;
      }
    }

    return nextNode;
  }

  // to adjust next focused node so that the selected radio element
  // will be focused if next one is radio button group
  function tabbaleNodeWithRadioAdjustment(index, increment) {
    var node = tabbableNodes[index];
    if (node.type !== 'radio') {
      return node;
    }

    var nextNode;
    for (var i = index + increment; i < tabbableNodes.length; i = i + increment) {
      nextNode = tabbableNodes[i];
      if (nextNode.type === 'radio' && nextNode.checked) {
        return nextNode;
      }
    }

    return node;
  }

  function updateTabbableNodes() {
    hadEmptyTabbableNodes = (tabbableNodes.length - config.extraTabbaleNodes.length) <= 0;
    tabbableNodes = tabbable(container).concat(config.extraTabbaleNodes);
    firstTabbableNode = tabbableNodes[0];
    lastTabbableNode = tabbableNodes[tabbableNodes.length - 1];
  }

  function readjustFocus(e) {
    if (e.shiftKey) return tryFocus(lastTabbableNode);

    tryFocus(firstTabbableNode);
  }
}

function isEscapeEvent(e) {
  return e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27;
}

function tryFocus(node) {
  if (!node || !node.focus) return;
  if (node === document.activeElement)  return;

  node.focus();
  if (node.tagName.toLowerCase() === 'input') {
    node.select();
  }
}

module.exports = focusTrap;
