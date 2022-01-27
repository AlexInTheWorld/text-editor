const editor = document.getElementById("textBox");
const html_view = document.getElementById("html-viewer");
var els_collection = []; // To hold els to be removed after style modification by the user

const styling_ops = {
  applyStyles: function (sel, prop, val) {
    set_new_textsNstyles(sel, prop, val);
    removeRedundantEls();
  },
  setLink: function (sel) {
    setLink(sel);
  },
  removeFormatting: function (sel) {
    removeFormatting(sel);
  },
  showHTML: function (range) {
    range.collapse();
  },
  alignText: function (sel, prop, val) {
    alignText(sel, prop, val);
  }
};

/********************************
 ----- Auxiliary functions -----
 *******************************/

// Check if the to-be-updated span has the same values for all its style properties
function hasTheSameStyles(current_span, next_span) {
  var response = true;
  var current_styles = current_span.style;

  for (let property in current_styles) {
    if (current_styles[property] !== next_span.style[property]) {
      response = false;
      break;
    }
  }

  return response;
}

// Add SPAN els to a specified parent container right before the container with split text
function span_making_machine(texts, stop_node) {
  var spans = [];
  var current_node = stop_node;
  var prev_node =
    stop_node.nodeName.toUpperCase !== "SPAN" ? stop_node : undefined;

  for (let i = texts.length - 1; i >= 0; i--) {
    if (current_node.nodeName.toUpperCase() !== "SPAN") {
      current_node = document.createElement("SPAN");
      var txt = document.createTextNode(texts[i]);
      current_node.appendChild(txt);
    } else {
      current_node.textContent = texts[i];
    }
    // Do not insert any new span element before another span that acts as stop_node
    // Reuse by modifying its text content
    if (prev_node) {
      stop_node.parentNode.insertBefore(current_node, prev_node);
    }

    prev_node = current_node;
    spans.unshift(current_node);
    current_node = i ? spans[0].cloneNode(false) : null;
  }

  return spans;
}

// Split text inside the container based on selection extension: left, selected, right
function splitText_and_Styles(txt_input, sel_start, sel_end) {
  var output_obj = { texts: [], affected_node: 0 };
  var idx = 0;
  var node_num = 0;

  [
    [sel_start, false],
    [sel_end, true],
    [txt_input.length, false]
  ].forEach((item, i) => {
    let txt_fragment = "";
    while (idx < item[0]) {
      txt_fragment += txt_input[idx];
      idx++;
    }
    if (item[1]) {
      output_obj.affected_node = node_num; // Set index of the to-be-styled text
    }
    if (txt_fragment) {
      output_obj.texts.push(txt_fragment);
      node_num++;
    }
  });

  return output_obj;
}

// Find target node to apply styles to and the next sibling of the childless node in the selection
function findTargetNode_and_NextNode(input_node, end_node) {
  var operations_on_input = {
    input_node: input_node,
    firstChild: function () {
      while (this.input_node !== end_node && this.input_node.firstChild) {
        this.input_node = this.input_node.firstChild;
      }
      return this.input_node;
    },
    nextSibling: function () {
      if (this.input_node !== end_node) {
        while (!this.input_node.nextSibling) {
          this.input_node = this.input_node.parentNode;
        }
        this.input_node = this.input_node.nextSibling;
      } else {
        this.input_node = null;
      }
      return this.input_node;
    }
  };

  return [operations_on_input.firstChild(), operations_on_input.nextSibling()];
}

function clearStyle(node) {
  for (let property in node.style) {
    node.style[property] = "";
  }
}

// Insert dangling non-div or paragraph nodes of the editor area into separate DIV elements
function insertTextsintoDIVs(range = null) {
  var nodes = {
    index: 0,
    current_node: editor.childNodes[0],
    start: "not found",
    end: "not found"
  };
  var el_copied;
  var new_div;

  while (nodes.current_node) {
    if (range && (nodes.start === "not found" || nodes.end === "not found")) {
      let not_found_arr = (nodes.start + "start" + "," + nodes.end + "end")
        .replace(/not found|\d+\w+/g, "")
        .split(",")
        .filter((str, i) => str);
      for (let i = 0; i < not_found_arr.length; i++) {
        if (
          nodes.current_node === range[not_found_arr[i] + "Container"] ||
          nodes.current_node.contains(range[not_found_arr[i] + "Container"])
        ) {
          nodes[not_found_arr[i]] = nodes.index;
        }
      }
    }

    if (
      nodes.current_node.nodeName.toUpperCase() !== "DIV" &&
      nodes.current_node.nodeName.toUpperCase() !== "P"
    ) {
      new_div = document.createElement("DIV");

      while (
        nodes.current_node.nodeName.toUpperCase() !== "DIV" &&
        nodes.current_node.nodeName.toUpperCase() !== "P"
      ) {
        els_collection.push(nodes.current_node);
        // If target node is text copy its content and place it into a new text node appendable to the DIV created
        if (nodes.current_node.nodeName === "#text") {
          el_copied = document.createTextNode(nodes.current_node.textContent);
        } else {
          el_copied = nodes.current_node.cloneNode(true);
        }

        new_div.appendChild(el_copied);
        nodes.current_node = nodes.current_node.nextSibling;

        if (!nodes.current_node) {
          break;
        }
      }
      editor.insertBefore(new_div, nodes.current_node);
    } else {
      nodes.current_node = nodes.current_node.nextSibling;
    }

    nodes.index++;
  }

  if (range) {
    return [nodes.start, nodes.end];
  }
}

/* ---------------- */

// Apply corresponding styles to selection in editor area (inserting new spans, if necessary)
function set_new_textsNstyles(uRange, prop, val) {
  var next_node = uRange.startContainer;
  var target_node;
  var affected_node;
  var start_AND_end = { start: null, end: null };

  do {
    // Get the target node and the next node
    [target_node, next_node] = findTargetNode_and_NextNode(
      next_node,
      uRange.endContainer
    );

    // Skip nodes without text content
    if (target_node.nodeName === "#text") {
      if (
        target_node !== uRange.startContainer &&
        target_node !== uRange.endContainer &&
        target_node.parentNode.nodeName.toUpperCase === "SPAN"
      ) {
        // Apply the new style to the whole container. The text cannot be split, thus it is selected in its entirety
        affected_node = target_node;
        affected_node.style[prop] = val;
      } else {
        // Get split text based on position of applied style and the index of affected node/text
        var res_w_texts = splitText_and_Styles(
          target_node.textContent,
          target_node === uRange.startContainer ? uRange.startOffset : 0,
          target_node === uRange.endContainer
            ? uRange.endOffset
            : target_node.length
        );
        var stop_node = target_node;

        if (target_node.parentNode.nodeName.toUpperCase() !== "SPAN") {
          els_collection.push(target_node);
        } else {
          stop_node = target_node.parentNode;
        }

        // Insert necessary spans before the current_node to accomodate new pieces of split text. Return all span els affected.
        var result_w_nodes = span_making_machine(res_w_texts.texts, stop_node);
        // Apply new style to the corresponding span
        affected_node = result_w_nodes[res_w_texts.affected_node];
        affected_node["style"][prop] = val;
        if (!start_AND_end.start) {
          start_AND_end.start = affected_node.firstChild;
        } else {
          start_AND_end.end = affected_node.firstChild;
        }
      }
    }
  } while (next_node);

  start_AND_end.end = start_AND_end.end || start_AND_end.start;
  uRange.setStart(start_AND_end.start, 0);
  uRange.setEnd(start_AND_end.end, start_AND_end.end.length);
}

// Detect contiguous span els with identical style declarations within a dividing element and merge them
function mergeSpans() {
  var all_spans = editor.getElementsByTagName("span");
  var num_spans = all_spans.length;
  var idx = 0;

  while (idx < num_spans) {
    var current_span = all_spans[idx];
    idx++;
    while (
      idx < num_spans &&
      all_spans[idx].previousSibling === all_spans[idx - 1] &&
      hasTheSameStyles(all_spans[idx - 1], all_spans[idx])
    ) {
      current_span.textContent += all_spans[idx].textContent;
      els_collection.push(all_spans[idx]);
      idx++;
    }
  }
}

// Remove elements with duplicated content
function removeRedundantEls() {
  while (els_collection.length) {
    els_collection[0].remove();
    els_collection.shift();
  }
}

function cleanEditor() {
  if (editor.hasChildNodes()) {
    for (let i = 0; i < editor.childNodes.length; i++) {
      els_collection.push(editor.childNodes[i]);
    }
    removeRedundantEls();
  }
}

function removeFormatting(range) {
  var txts;
  var start = range.startContainer;
  var end = range.endContainer;
  // If applicable, modify range and set new start and end
  if (range.startContainer !== range.endContainer) {
    // If selection is not contained in a SPAN element, no need to erase style (due to lack of it)
    if (
      range.startContainer.nodeName === "#text" &&
      range.startContainer.parentNode.nodeName.toUpperCase() === "SPAN"
    ) {
      txts = splitText_and_Styles(
        range.startContainer.textContent,
        range.startOffset,
        range.startContainer.length
      );
      start = span_making_machine(txts.texts, range.startContainer.parentNode)[
        txts.affected_node
      ].firstChild;
      range.setStart(start, 0);
    }

    if (
      range.endContainer.nodeName === "#text" &&
      range.endContainer.parentNode.nodeName.toUpperCase() === "SPAN"
    ) {
      txts = splitText_and_Styles(
        range.endContainer.textContent,
        0,
        range.endOffset
      );
      end = span_making_machine(txts.texts, range.endContainer.parentNode)[
        txts.affected_node
      ].firstChild;
      range.setEnd(end, end.length);
    }
  } else {
    if (
      range.startContainer.nodeName === "#text" &&
      range.startContainer.parentNode.nodeName.toUpperCase() === "SPAN"
    ) {
      txts = splitText_and_Styles(
        range.endContainer.textContent,
        range.startOffset,
        range.endOffset
      );
      let affected_span = span_making_machine(
        txts.texts,
        range.endContainer.parentNode
      )[txts.affected_node];
      clearStyle(affected_span);
      range.selectNode(affected_span);
    }
  }

  var next_node = start;

  do {
    // Get the target node and the next node
    [target_node, next_node] = findTargetNode_and_NextNode(next_node, end);

    // Skip nodes without text content and whose parent is not a SPAN element
    if (
      target_node.nodeName === "#text" &&
      target_node.parentNode.nodeName.toUpperCase() === "SPAN"
    ) {
      for (let property in target_node.parentNode.style) {
        target_node.parentNode.style[property] = "";
      }
    }
  } while (next_node);
}

function setLink(range) {
  var ulink = prompt("Type in here the web address:");
  if (ulink) {
    var link_el = document.createElement("A");
    var href = document.createAttribute("href");
    href.value = ulink;
    link_el.setAttributeNode(href);
    try {
      range.surroundContents(link_el);
    } catch (err) {
      alert("Cannot set link for text in different elements");
    }
  }
}

function alignText(range, property, value) {
  var [start, end] = insertTextsintoDIVs(range);
  removeRedundantEls(); // Remove dangling text nodes with douplicated content
  range.setStart(editor.childNodes[start], 0);
  range.setEnd(
    editor.childNodes[end],
    editor.childNodes[end].childNodes.length
  );

  for (let i = start; i <= end; i++) {
    editor.childNodes[i].style[property] = value;
  }
}

function styleSelection(instruction, property = null, value = null) {
  var selObj = window.getSelection();

  if (selObj.rangeCount === 1) {
    var range_selected = selObj.getRangeAt(0);
    var editor_range = document.createRange();
    editor_range.selectNode(editor);

    // compareBoundaryPoints compares the boundary points of the user selected range with those of the range defined by encompassing editor element
    var comparison1 = range_selected.compareBoundaryPoints(
      Range.END_TO_END,
      editor_range
    );
    var comparison2 = range_selected.compareBoundaryPoints(
      Range.START_TO_START,
      editor_range
    );

    /* Ensure selection falls into edition area */
    if (comparison1 !== 1 && comparison2 !== -1) {
      // Apply styles to a non empty selection
      if (!selObj.isCollapsed) {
        if (property) {
          styling_ops[instruction](range_selected, property, value);
        } else {
          styling_ops[instruction](range_selected);
        }
      } else if (instruction !== "showHTML") {
        alert("make a selection");
      }
    }
  }
}

function showHTML(el) {
  if (el.checked) {
    styleSelection("showHTML");
    mergeSpans();
    removeRedundantEls();
    // Show HTML-structure visor in the foreground
    html_view.textContent = editor.innerHTML;
    editor.style.visibility = "hidden";
    html_view.style.visibility = "visible";
  } else {
    // Show editor area, hide HTML-structure visor
    html_view.style.visibility = "hidden";
    editor.style.visibility = "visible";
  }
}
