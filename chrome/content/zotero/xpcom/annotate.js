/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright (c) 2006  Center for History and New Media
                        George Mason University, Fairfax, Virginia, USA
                        http://chnm.gmu.edu
    
    Licensed under the Educational Community License, Version 1.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at
    
    http://www.opensource.org/licenses/ecl1.php
    
    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
    
    ***** END LICENSE BLOCK *****
*/

const TEXT_TYPE = Components.interfaces.nsIDOMNode.TEXT_NODE;

//////////////////////////////////////////////////////////////////////////////
//
// Zotero.Annotate
//
//////////////////////////////////////////////////////////////////////////////
// general purpose annotation/highlighting methods

Zotero.Annotate = new function() {
	this.annotationColor = "#fff580";
	this.annotationBarColor = "#c0b860";
	this.annotationBorderColor = "#878244";
	this.highlightColor = "#fff580";
	
	this.getPathForPoint = getPathForPoint;
	this.getPointForPath = getPointForPath;
	this.getPixelOffset = getPixelOffset;
	this.normalizeRange = normalizeRange;
	
	/*
	 * gets a path object, comprising an XPath, text node index, and offset, for
	 * a given node.
	 */
	function getPathForPoint(node, offset) {
		Zotero.debug("have node of offset "+offset);
		
		var path = {parent:"", textNode:null, offset:(offset ? offset : null)};
		
		var lastWasTextNode = node.nodeType == TEXT_TYPE;

		if(node.parentNode.getAttribute && node.parentNode.getAttribute("zotero")) {		
			// if the selected point is inside a highlight node, add offsets of
			// preceding text nodes in this zotero node			
			var sibling = node.previousSibling;
			while(sibling) {
				if(sibling.nodeType == TEXT_TYPE) path.offset += sibling.nodeValue.length;
				sibling = sibling.previousSibling;
			}
			
			// use parent node for future purposes
			node = node.parentNode;
		} else if(node.getAttribute && node.getAttribute("zotero")) {
			// if selected point is a zotero node, move it to the last character
			// of the previous node
			node = node.previousSibling;
			if(node.nodeType == TEXT_TYPE) {
				path.offset = node.nodeValue.length;
				lastWasTextNode = true;
			} else {
				path.offset = 0;
			}
		}
		
		lastWasTextNode = lastWasTextNode || node.nodeType == TEXT_TYPE;
		
		if(lastWasTextNode) {
			path.textNode = 1;
			var sibling = node.previousSibling;
			var first = true;
			
			while(sibling) {
				var isZotero = undefined;
				if(sibling.getAttribute) isZotero = sibling.getAttribute("zotero");
				
				if(sibling.nodeType == TEXT_TYPE ||
				  (isZotero == "highlight")) {
				   	// is a text node
					if(first == true) {
						// is still part of the first text node
						if(sibling.getAttribute) {
							// get offset of all child nodes
							for each(var child in sibling.childNodes) {
								if(child && child.nodeType == TEXT_TYPE) {
									path.offset += child.nodeValue.length;
								}
							}
						} else {
							path.offset += sibling.nodeValue.length;
						}
					} else if(!lastWasTextNode) {
						// is part of another text node
						path.textNode++;
						lastWasTextNode = true;
					}
				} else if(!isZotero) {		// skip over annotation marker nodes
					// is not a text node
					lastWasTextNode = first = false;
				}
				
				sibling = sibling.previousSibling;
			}
			
			node = node.parentNode;
		} else if(path.offset != 0) {
			for(; path.offset > 0 && node.nextSibling; path.offset--) {
				node = node.nextSibling;
			}
		}
		
		var doc = node.ownerDocument;
		
		while(node && node != doc) {
			var number = 1;
			var sibling = node.previousSibling;	
			while(sibling) {
				if(sibling.tagName == node.tagName) number++;
				sibling = sibling.previousSibling;
			}
			
			// don't add highlight nodes
			if(node.tagName) {
				var tag = node.tagName.toLowerCase();
				if(tag == "span") {
					tag += "[not(@zotero)]";
				}
			} else {
				var tag = node.nodeType;
			}
			
			path.parent = "/"+tag+"["+number+"]"+path.parent;
			
			node = node.parentNode;
		}
		
		Zotero.debug("Annotate: got path "+path.parent+", "+path.textNode+", "+path.offset);
		
		return path;
	}
	
	function getPointForPath(parent, textNode, offset, document, nsResolver) {
		var point = {offset:0};
		
		// try to evaluate parent
		try {
			point.node = document.evaluate(parent, document, nsResolver,
				Components.interfaces.nsIDOMXPathResult.ANY_TYPE, null).iterateNext();
		} catch(e) {
			Zotero.debug("Annotate: could not find XPath "+parent+" in getPointForPath");
			return false;
		}
		
		// don't do further processing if this path does not refer to a text node
		if(!textNode) return point;
		
		// parent node must have children if we have a text node index
		if(!point.node.firstChild) {
			Zotero.debug("Annotate: node "+parent+" has no children in getPointForPath");
			return false;
		}
		
		point.node = point.node.firstChild;
		point.offset = offset;
		var lastWasTextNode = false;
		var number = 0;
		
		// find text node
		while(true) {
			var isZotero = undefined;
			if(point.node.getAttribute) isZotero = point.node.getAttribute("zotero");
			
			if(point.node.nodeType == TEXT_TYPE ||
			   isZotero == "highlight") {
				if(!lastWasTextNode) {
					number++;
					
					// if we found the node we're looking for, break
					if(number == textNode) break;
					
					lastWasTextNode = true;
				}
			} else if(!isZotero) {
				lastWasTextNode = false;
			}
			
			point.node = point.node.nextSibling;
			// if there's no node, this point is invalid
			if(!point.node) {
				Zotero.debug("Annotate: reached end of node list while searching for text node "+textNode+" of "+parent);
				return false;
			}
		}
		
		// find point.offset
		while(true) {
			// get length of enclosed text node
			if(point.node.getAttribute) {
				// this is a highlighted node; loop through and subtract all
				// offsets, breaking if we reach the end
				var parentNode = point.node;
				point.node = point.node.firstChild;
				while(point.node) {
					if(point.node.nodeType == TEXT_TYPE) {
						// break if end condition reached
						if(point.node.nodeValue.length >= point.offset) return point;
						// otherwise, continue subtracting offsets
						point.offset -= point.node.nodeValue.length;
					}
					point.node = point.node.nextSibling;
				}
				// restore parent node
				point.node = parentNode;
			} else {
				// this is not a highlighted node; use simple node length
				if(point.node.nodeValue.length >= point.offset) return point;
				point.offset -= point.node.nodeValue.length;
			}
			
			// get next node
			point.node = point.node.nextSibling;
			// if next node does not exist or is not a text node, this
			// point is invalid
			if(!point.node || (point.node.nodeType != TEXT_TYPE &&
			  (!point.node.getAttribute || !point.node.getAttribute("zotero")))) {
				Zotero.debug("Annotate: could not find point.offset "+point.offset+" for text node "+textNode+" of "+parent);
				return false;
			}
		}
	}
	
	/*
	 * gets the pixel offset of an item from the top left of a page. the
	 * optional "offset" argument specifies a text offset.
	 */
	function getPixelOffset(node, offset) {
		var x = 0;
		var y = 0;
		
		do {
			x += node.offsetLeft;
			y += node.offsetTop;
			node = node.offsetParent;
		} while(node);
		
		return [x, y];
	}
	
	/*
	 * Sometimes, Firefox stupidly decides to use node offsets to reference
	 * nodes. This is a terrible idea, because Firefox then can't figure out
	 * when the node boundary matches another. This fixes it.
	 */
	 function normalizeRange(range) {
	 	for each(var type in ["start", "end"]) {
	 		var container = range[type+"Container"];
	 		var offset = range[type+"Offset"];
	 		
	 		if(container.nodeType != TEXT_TYPE && offset) {	 			
				for(; offset > 0 && container.nextSibling; offset--) {
					container = container.nextSibling;
				}
				
				if(type == "start") {
					range.setStart(container, offset);
				} else {
					range.setEnd(container, offset);
				}
	 		}
	 	}
	 }
}

//////////////////////////////////////////////////////////////////////////////
//
// Zotero.Annotations
//
//////////////////////////////////////////////////////////////////////////////
// a set of annotations to correspond to a given page

Zotero.Annotations = function(Zotero_Browser, browser, itemID) {
	this.Zotero_Browser = Zotero_Browser;
	this.browser = browser;
	this.document = browser.contentDocument;
	this.window = browser.contentWindow;
	this.nsResolver = this.document.createNSResolver(this.document.documentElement);
	
	this.itemID = itemID;
	
	this.annotations = new Array();
	this.highlights = new Array();
	
	this.zIndex = 100;
	
	this.load();
}

Zotero.Annotations.prototype.createAnnotation = function() {
	var annotation = new Zotero.Annotation(this);
	this.annotations.push(annotation);
	return annotation;
}

Zotero.Annotations.prototype.createHighlight = function(selectedRange) {
	var deleteHighlights = new Array();
	var startIn = false, endIn = false;
	
	// first, see if part of this range is already covered
	for(var i in this.highlights) {
		var compareHighlight = this.highlights[i];
		var compareRange = compareHighlight.range;
		
		var startToStart = compareRange.compareBoundaryPoints(Components.interfaces.nsIDOMRange.START_TO_START, selectedRange);
		var endToEnd = compareRange.compareBoundaryPoints(Components.interfaces.nsIDOMRange.END_TO_END, selectedRange);
		if(startToStart != 1 && endToEnd != -1) {
			// if the selected range is inside this one
			return compareHighlight;
		} else if(startToStart != -1 && endToEnd != 1) {
			// if this range is inside selected range, delete
			this.highlights[i] = undefined;
			delete this.highlights[i];
		} else {
			var endToStart = compareRange.compareBoundaryPoints(Components.interfaces.nsIDOMRange.END_TO_START, selectedRange);
			if(endToStart != 1 && endToEnd != -1) {
				// if the end of the selected range is between the start and
				// end of this range
				var endIn = i;
			} else {
				var startToEnd = compareRange.compareBoundaryPoints(Components.interfaces.nsIDOMRange.START_TO_END, selectedRange);
				if(startToEnd != -1 && startToStart != 1) {
					// if the start of the selected range is between the
					// start and end of this range
					var startIn = i;
				}
			}
		}
	}
	
	if(startIn !== false && endIn !== false) {
		selectedRange.setStart(this.highlights[startIn].range.endContainer,
			this.highlights[startIn].range.endOffset);
		selectedRange.setEnd(this.highlights[endIn].range.endContainer,
			this.highlights[endIn].range.endOffset);
		this.highlights[startIn].initWithRange(selectedRange);
		
		// delete end range
		this.highlights[endIn] = undefined;
		delete this.highlights[endIn];
		
		return startIn;
	} else if(startIn !== false) {
		selectedRange.setStart(this.highlights[startIn].range.startContainer,
			this.highlights[startIn].range.startOffset);
		this.highlights[startIn].initWithRange(selectedRange);
		return this.highlights[startIn];
	} else if(endIn != false) {
		selectedRange.setEnd(this.highlights[endIn].range.endContainer,
			this.highlights[endIn].range.endOffset);
		this.highlights[endIn].initWithRange(selectedRange);
		return this.highlights[endIn];
	}
	
	Zotero.Annotate.normalizeRange(selectedRange);
	var highlight = new Zotero.Highlight(this);
	highlight.initWithRange(selectedRange);
	this.highlights.push(highlight);
	return highlight;
}

Zotero.Annotations.prototype.unhighlight = function(selectedRange) {
	// first, see if part of this range is already covered
	for(var i in this.highlights) {
		var compareHighlight = this.highlights[i];
		var compareRange = compareHighlight.range;
		
		Zotero.Annotate.normalizeRange(compareRange);
		
		var startToStart = compareRange.compareBoundaryPoints(Components.interfaces.nsIDOMRange.START_TO_START, selectedRange);
		var endToEnd = compareRange.compareBoundaryPoints(Components.interfaces.nsIDOMRange.END_TO_END, selectedRange);
		
		var done = false;
		
		if(startToStart == -1 && endToEnd == 1) {
			Zotero.debug("checkpoint 1");
			// there's a bug in Mozilla's handling of ranges
			var selectStartPoint = Zotero.Annotate.getPathForPoint(selectedRange.startContainer, selectedRange.startOffset);
			var compareStartPoint = Zotero.Annotate.getPathForPoint(compareRange.startContainer, compareRange.startOffset);
			if(selectStartPoint.parent == compareStartPoint.parent &&
			   selectStartPoint.textNode == compareStartPoint.textNode &&
			   selectStartPoint.offset == compareStartPoint.offset) {
				startToStart = 0;
			} else {				
				var selectEndPoint = Zotero.Annotate.getPathForPoint(selectedRange.endContainer, selectedRange.endOffset);
				var compareEndPoint = Zotero.Annotate.getPathForPoint(compareRange.endContainer, compareRange.endOffset);
				if(selectEndPoint.parent == compareEndPoint.parent &&
				   selectEndPoint.textNode == compareEndPoint.textNode &&
				   selectEndPoint.offset == compareEndPoint.offset) {
					endToEnd = 0;
				} else {
					
					// this will unhighlight the entire end
					compareHighlight.unhighlight(selectedRange.startContainer, selectedRange.startOffset, 2);
					
					var newRange = this.document.createRange();
					
					// need to use point references because they disregard highlights
					
					var startPoint = Zotero.Annotate.getPointForPath(selectEndPoint.parent, selectEndPoint.textNode, selectEndPoint.offset,
						this.document, this.nsResolver);
					var endPoint = Zotero.Annotate.getPointForPath(compareEndPoint.parent, compareEndPoint.textNode, compareEndPoint.offset,
						this.document, this.nsResolver);
					newRange.setStart(startPoint.node, startPoint.offset);
					newRange.setEnd(endPoint.node, endPoint.offset);
					
					// create new node
					var highlight = new Zotero.Highlight(this);
					highlight.initWithRange(newRange);
					this.highlights.push(highlight);
					
					done = true;
				}
			}
		}
		
		if(!done) {
			if(startToStart != -1 && endToEnd != 1) {
				Zotero.debug("checkpoint 2");
				// if this range is inside selected range, delete
				compareHighlight.unhighlight(null, null, 0);
				
				this.highlights[i] = undefined;
				delete this.highlights[i];
			} else {
				var endToStart = compareRange.compareBoundaryPoints(Components.interfaces.nsIDOMRange.END_TO_START, selectedRange);
				if(endToStart != 1 && endToEnd != -1) {
					Zotero.debug("checkpoint 3");
					// if the end of the selected range is between the start and
					// end of this range
					//compareRange.setStart(selectedRange.endContainer, selectedRange.endOffset);
					compareHighlight.unhighlight(selectedRange.endContainer, selectedRange.endOffset, 1);
				} else {
					var startToEnd = compareRange.compareBoundaryPoints(Components.interfaces.nsIDOMRange.START_TO_END, selectedRange);
					if(startToEnd != -1 && startToStart != 1) {
						Zotero.debug("checkpoint 4");
						// if the start of the selected range is between the
						// start and end of this range
						//compareRange.setEnd(selectedRange.startContainer, selectedRange.startOffset);
						compareHighlight.unhighlight(selectedRange.startContainer, selectedRange.startOffset, 2);
					}
				}
			}
		}
	}
}

Zotero.Annotations.prototype.refresh = function() {
	for each(var annotation in this.annotations) {
		annotation.display();
	}
}

Zotero.Annotations.prototype.save = function() {
	Zotero.DB.beginTransaction();
	try {
		Zotero.DB.query("DELETE FROM highlights WHERE itemID = ?", [this.itemID]);
		
		// save highlights
		for each(var highlight in this.highlights) {
			if(highlight) highlight.save();
		}
		
		// save annotations
		for each(var annotation in this.annotations) {
			annotation.save();
		}
		Zotero.DB.commitTransaction();
	} catch(e) {
		Zotero.DB.rollbackTransaction();
	}
}

Zotero.Annotations.prototype.load = function() {
	// load annotations
	var rows = Zotero.DB.query("SELECT * FROM annotations WHERE itemID = ?", [this.itemID]);
	for each(var row in rows) {
		var annotation = this.createAnnotation();
		annotation.initWithDBRow(row);
	}
	
	// load highlights
	var rows = Zotero.DB.query("SELECT * FROM highlights WHERE itemID = ?", [this.itemID]);
	for each(var row in rows) {
		try {
			var highlight = new Zotero.Highlight(this);
			highlight.initWithDBRow(row);
			this.highlights.push(highlight);
		} catch(e) {
			Zotero.debug("Annotate: could not load highlight");
		}
	}
}

Zotero.Annotations.prototype.setCollapsed = function(status) {
	for each(var annotation in this.annotations) {
		annotation.setCollapsed(status);
	}
}

//////////////////////////////////////////////////////////////////////////////
//
// Zotero.Annotation
//
//////////////////////////////////////////////////////////////////////////////
// an annotation (usually generated using Zotero.Annotations.createAnnotation())

Zotero.Annotation = function(annotationsObj) {
	this.annotationsObj = annotationsObj;
	this.window = annotationsObj.browser.contentWindow;
	this.document = annotationsObj.browser.contentDocument;
	this.nsResolver = annotationsObj.nsResolver;
	this.cols = 30;
	this.rows = 5;
}

Zotero.Annotation.prototype.initWithEvent = function(e) {
	var maxOffset = false;
	
	try {
		var range = this.window.getSelection().getRangeAt(0);
		this.node = range.startContainer;
		var offset = range.startOffset;
		if(this.node.nodeValue) maxOffset = this.node.nodeValue.length;
	} catch(err) {
		this.node = e.target;
		var offset = 0;
	}
		
	var clickX = this.window.pageXOffset + e.clientX;
	var clickY = this.window.pageYOffset + e.clientY;
	
	var isTextNode = (this.node.nodeType == Components.interfaces.nsIDOMNode.TEXT_NODE);
	
	if(offset == 0 || !isTextNode) {
		// tag by this.offset from parent this.node, rather than text
		if(isTextNode) this.node = this.node.parentNode;
		offset = 0;
	}
	
	if(offset) this._generateMarker(offset);
	
	var pixelOffset = Zotero.Annotate.getPixelOffset(this.node);
	this.x = clickX - pixelOffset[0];
	this.y = clickY - pixelOffset[1];
	
	Zotero.debug("Annotate: added new annotation");
	
	this.displayWithAbsoluteCoordinates(clickX, clickY);
	this.textarea.select();
}

Zotero.Annotation.prototype.initWithDBRow = function(row) {
	var point = Zotero.Annotate.getPointForPath(row.parent, row.textNode,
		row.offset, this.document, this.nsResolver);
	if(!point) {
		Zotero.debug("Annotate: could not load annotation "+row.annotationID+" from DB");
		return;
	}
	this.node = point.node;
	
	if(point.offset) this._generateMarker(point.offset);
	
	this.x = row.x;
	this.y = row.y;
	this.cols = row.cols;
	this.rows = row.rows;
	this.annotationID = row.annotationID;
	
	this.display();
	
	this.textarea.value = row.text;
}

Zotero.Annotation.prototype.save = function() {
	var text = this.textarea.value;
	
	if(this.annotationID) {
		// already in the DB; all we need to do is update the text
		var query = "UPDATE annotations SET cols = ?, rows = ?, text = ? WHERE annotationID = ?";
		var parameters = [
			this.cols,				// cols
			this.rows,				// rows
			text,					// text
			this.annotationID
		];
	} else {
		// fetch marker location
		if(this.node.getAttribute && this.node.getAttribute("zotero") == "annotation-marker") {
			var node = this.node.previousSibling;
			
			if(node.nodeType != Components.interfaces.nsIDOMNode.TEXT_NODE) {
				// someone added a highlight around this annotation
				node = node.lastChild;
			}
			var offset = node.nodeValue.length;
		} else {
			var node = this.node;
			var offset = 0;
		}
		
		// fetch path to node
		var path = Zotero.Annotate.getPathForPoint(node, offset);
		
		var query = "INSERT INTO annotations VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
		var parameters = [
			this.annotationsObj.itemID,	// itemID
			path.parent,				// parent
			path.textNode,				// textNode
			path.offset,				// offset
			this.x,						// x
			this.y,						// y
			this.cols,					// cols
			this.rows,					// rows
			text						// text
		];
	}
	
	Zotero.DB.query(query, parameters);
}

Zotero.Annotation.prototype.display = function() {
	if(!this.node) throw "Annotation not initialized!";
	
	var x = 0, y = 0;
	
	// first fetch the coordinates
	var pixelOffset = Zotero.Annotate.getPixelOffset(this.node);
	
	var x = pixelOffset[0] + this.x;
	var y = pixelOffset[1] + this.y;
 	
	// then display
	this.displayWithAbsoluteCoordinates(x, y);
}

Zotero.Annotation.prototype.displayWithAbsoluteCoordinates = function(absX, absY) {
	if(!this.node) throw "Annotation not initialized!";
	
	var startScroll = this.window.scrollMaxX;
	
	if(!this.div) {
		var me = this;
		var body = this.document.getElementsByTagName("body")[0];
		
		// generate regular div
		this.div = this.document.createElement("div");
		this.div.setAttribute("zotero", "annotation");
		body.appendChild(this.div);
		this.div.style.backgroundColor = Zotero.Annotate.annotationColor;
		this.div.style.padding = "0";
		this.div.style.display = "block";
		this.div.style.position = "absolute";
		this.div.style.border = "1px solid";
		this.div.style.borderColor = Zotero.Annotate.annotationBorderColor;
		this.div.style.MozOpacity = 0.9;
		this.div.style.zIndex = this.annotationsObj.zIndex;
		this.div.addEventListener("click", function() { me._click() }, false);
		this._addChildElements();
		
		// generate pushpin div
		this.pushpinDiv = this.document.createElement("div");
		this.pushpinDiv.style.padding = "0";
		this.pushpinDiv.style.display = "block";
		this.pushpinDiv.style.position = "absolute";
		this.pushpinDiv.style.MozOpacity = 0.9;
		this.pushpinDiv.style.cursor = "pointer";
		// generate pushpin image
		var img = this.document.createElement("img");
		img.src = "chrome://zotero/skin/annotation-hidden.png";
		img.addEventListener("click", function() {
			me.setCollapsed(false);
		}, false);
		this.pushpinDiv.appendChild(img);
		body.appendChild(this.pushpinDiv);
	}
	this.div.style.display = "block";
	this.div.style.left = absX+"px";
	this.div.style.top = absY+"px";
	
	// move to the left if we're making things scroll
	if(absX + this.div.scrollWidth > this.window.innerWidth) {
		this.div.style.left = (absX-this.div.scrollWidth)+"px";
	}
}

Zotero.Annotation.prototype.setCollapsed = function(status) {
	if(status == true) {
		// hide div
		this.div.style.display = "none";
		// move pushpin div
		this.pushpinDiv.style.left = this.div.style.left;
		this.pushpinDiv.style.top = this.div.style.top;
		this.pushpinDiv.style.zIndex = this.div.style.zIndex;
		// show pushpin div
		this.pushpinDiv.style.display = "block";
	} else {
		// hide pushpin div
		this.pushpinDiv.style.display = "none";
		// show div
		this.div.style.display = "block";
	}
}

Zotero.Annotation.prototype._generateMarker = function(offset) {
	// first, we create a new span at the correct offset in the node
	var range = this.document.createRange();
	range.setStart(this.node, offset);
	range.setEnd(this.node, offset);
	
	// next, we delete the old node, if there is one
	if(this.node && this.node.getAttribute && this.node.getAttribute("zotero") == "annotation-marker") {
		this.node.parentNode.removeChild(this.node);
		this.node = undefined;
	}
		
	// next, we insert a span
	this.node = this.document.createElement("span");
	this.node.setAttribute("zotero", "annotation-marker");
	range.insertNode(this.node);
}

Zotero.Annotation.prototype._addChildElements = function() {
	var me = this;
	
	// top bar
	var bar = this.document.createElement("div");
	bar.style.display = "block";
	bar.style.backgroundColor = Zotero.Annotate.annotationBarColor;
	bar.style.paddingRight = "0";
	bar.style.paddingLeft = bar.style.paddingTop = bar.style.paddingBottom = "1px";
	bar.style.borderBottom = "1px solid";
	bar.style.height = "10px";
	bar.style.borderColor = Zotero.Annotate.annotationBorderColor;
	
	// left box
	var closeDiv = this.document.createElement("div");
	closeDiv.style.display = "block";
	closeDiv.style.position = "absolute";
	closeDiv.style.left = "1px";
	closeDiv.style.top = "1px";
	closeDiv.style.cursor = "pointer";
	
	// close image
	var img = this.document.createElement("img");
	img.src = "chrome://zotero/skin/annotation-close.png";
	img.addEventListener("click", function(event) {
		if(me._confirmDelete(event)) {
			me._delete();
		}
	}, false);
	
	closeDiv.appendChild(img);
	bar.appendChild(closeDiv);
	
	// right box
	var moveDiv = this.document.createElement("div");
	moveDiv.style.display = "block";
	moveDiv.style.position = "absolute";
	moveDiv.style.right = "1px";
	moveDiv.style.top = "1px";
	moveDiv.style.cursor = "pointer";
	
	// move image
	this.moveImg = this.document.createElement("img");
	this.moveImg.src = "chrome://zotero/skin/annotation-move.png";
	this.moveImg.addEventListener("click", function(e) {
		me._startMove();
	}, false);
	moveDiv.appendChild(this.moveImg);
	
	// hide image
	var img = this.document.createElement("img");
	img.src = "chrome://zotero/skin/annotation-hide.png";
	img.addEventListener("click", function(event) {
		me.setCollapsed(true);
	}, false);
	moveDiv.appendChild(img);
	
	bar.appendChild(moveDiv);
	
	// grippy
	this.grippyDiv = this.document.createElement("div");
	this.grippyDiv.style.display = "block";
	this.grippyDiv.style.position = "absolute";
	this.grippyDiv.style.right = "0px";
	this.grippyDiv.style.bottom = "0px";
	this.grippyDiv.style.cursor = "move";
	var img = this.document.createElement("img");
	img.src = "chrome://zotero/skin/annotation-grippy.png";
	img.addEventListener("mousedown", function(event) {
		me._startDrag(event);
	}, false);
	this.grippyDiv.appendChild(img);
	
	// text area
	this.textarea = this.document.createElement("textarea");
	this.textarea.setAttribute("zotero", "annotation");
	this.textarea.setAttribute("wrap", "soft");
	this.textarea.cols = this.cols;
	this.textarea.rows = this.rows;
	this.textarea.style.fontFamily = "Arial, Lucida Grande, FreeSans, sans";
	this.textarea.style.fontSize = "12px";
	this.textarea.style.backgroundColor = Zotero.Annotate.annotationColor;
	this.textarea.style.border = "none";
	this.textarea.style.margin = "3px 3px 5px 3px";
	
	this.div.appendChild(bar);
	this.div.appendChild(this.grippyDiv);
	this.div.appendChild(this.textarea);
	
	this.colSize = this.textarea.clientWidth/this.cols;
	this.rowSize = this.textarea.clientHeight/this.rows;
}

Zotero.Annotation.prototype._click = function() {
	// clear current action
	this.annotationsObj.Zotero_Browser.toggleMode(null);
	
	// alter z-index
	this.annotationsObj.zIndex++
	this.div.style.zIndex = this.annotationsObj.zIndex;
}

Zotero.Annotation.prototype._confirmDelete = function(event) {
	if (this.textarea.value == '' ||
		!Zotero.Prefs.get('annotations.warnOnClose')) {
		return true;
	}
	
	var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
									.getService(Components.interfaces.nsIPromptService);
	
	var dontShowAgain = { value: false };
	var del = promptService.confirmCheck(
		this.window,
		Zotero.getString('annotations.confirmClose.title'),
		Zotero.getString('annotations.confirmClose.body'),
		Zotero.getString('general.dontShowWarningAgain'),
		dontShowAgain
	);
	
	if (dontShowAgain.value) {
		Zotero.Prefs.set('annotations.warnOnClose', false);
	}
	
	return del;
}

Zotero.Annotation.prototype._delete = function() {
	if(this.annotationID) {
		Zotero.DB.query("DELETE FROM annotations WHERE annotationID = ?", [this.annotationID]);
	}
	
	// hide div
	this.div.parentNode.removeChild(this.div);
	// delete from list
	for(var i in this.annotationsObj.annotations) {
		if(this.annotationsObj.annotations[i] == this) {
			this.annotationsObj.annotations.splice(i, 1);
		}
	}
}

Zotero.Annotation.prototype._startDrag = function(e) {
	var me = this;
	
	this.clickStartX = this.window.pageXOffset + e.clientX;
	this.clickStartY = this.window.pageYOffset + e.clientY;
	this.clickStartCols = this.textarea.cols;
	this.clickStartRows = this.textarea.rows;
	
	// add a listener to handle mouse moves
	this._handleDrag = function(e) {
		me._doDrag(e);
	}
	this.document.addEventListener("mousemove", this._handleDrag, false);
	
	// add a listener that gets called when things stop happening
	this._endDrag = function() {
		me.dragging = false;
		me.document.removeEventListener("mousemove", me._handleDrag, false);
		me.document.removeEventListener("mouseup", me._endDrag, false);
	}
	this.document.addEventListener("mouseup", this._endDrag, false);
	
	// stop propagation
	e.stopPropagation();
	e.preventDefault();
}

Zotero.Annotation.prototype._doDrag = function(e) {
	var pixelOffset = Zotero.Annotate.getPixelOffset(this.grippyDiv);
	var x = this.window.pageXOffset + e.clientX - this.clickStartX;
	var y = this.window.pageYOffset + e.clientY - this.clickStartY;
	
	// update sizes
	var colSize = this.textarea.clientWidth/this.textarea.cols;
	var rowSize = this.textarea.clientHeight/this.textarea.rows;
	
	// update cols and rows
	var cols = this.clickStartCols+Math.floor(x/colSize);
	cols = (cols > 5 ? cols : 5);
	this.textarea.cols = this.cols = cols;
	
	var rows = this.clickStartRows+Math.floor(y/rowSize);
	rows = (rows > 2 ? rows : 2);
	this.textarea.rows = this.rows = rows;
	
	// not sure why this is necessary
	this.div.style.width = (6+this.textarea.offsetWidth)+"px";
}

Zotero.Annotation.prototype._startMove = function(e) {
	// stop propagation
	e.stopPropagation();
	e.preventDefault();
	
	var body = this.document.getElementsByTagName("body")[0];
	
	// deactivate current action
	this.annotationsObj.Zotero_Browser.toggleMode(null);
	
	var me = this;
	// set the handler required to deactivate
	this.annotationsObj.clearAction = function() {
		me.document.removeEventListener("click", me._handleMove, false);
		body.style.cursor = "auto";
		me.moveImg.src = "chrome://zotero/skin/annotation-move.png";
		me.annotationsObj.clearAction = undefined;
	}
	
	// create a handler for clicking
	this._handleMove = function(e) {
		me.initWithEvent(e);
		me.annotationsObj.clearAction();
		
		// stop propagation
		e.stopPropagation();
		e.preventDefault();
	};
	
	this.document.addEventListener("click", this._handleMove, false);
	body.style.cursor = "pointer";
	this.moveImg.src = "chrome://zotero/skin/annotation-move-selected.png";
}

//////////////////////////////////////////////////////////////////////////////
//
// Zotero.Highlight
//
//////////////////////////////////////////////////////////////////////////////
// a highlight (usually generated using Zotero.Annotations.createHighlight())

Zotero.Highlight = function(annotationsObj) {
	this.annotationsObj = annotationsObj;
	this.window = annotationsObj.browser.contentWindow;
	this.document = annotationsObj.browser.contentDocument;
	this.nsResolver = annotationsObj.nsResolver;
	
	this.spans = new Array();
}

Zotero.Highlight.prototype.initWithDBRow = function(row) {
	var start = Zotero.Annotate.getPointForPath(row.startParent, row.startTextNode,
		row.startOffset, this.document, this.nsResolver);
	var end = Zotero.Annotate.getPointForPath(row.endParent, row.endTextNode,
		row.endOffset, this.document, this.nsResolver);
	if(!start || !end) {
		Zotero.debug("Highlight: could not initialize from DB row");
		return false;
	}
	
	this.range = this.document.createRange();
	this.range.setStart(start.node, start.offset);
	this.range.setEnd(end.node, end.offset);
	
	this._highlight();
}

Zotero.Highlight.prototype.initWithRange = function(range) {
	this.range = range;
	this._highlight();
}

Zotero.Highlight.prototype.save = function(index) {
	var textType = Components.interfaces.nsIDOMNode.TEXT_NODE;
	
	var start = Zotero.Annotate.getPathForPoint(this.range.startContainer, this.range.startOffset);
	var end = Zotero.Annotate.getPathForPoint(this.range.endContainer, this.range.endOffset);
	
	var query = "INSERT INTO highlights VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)";
	var parameters = [
		this.annotationsObj.itemID,	// itemID
		start.parent,				// startParent
		start.textNode,				// startTextNode
		start.offset,				// startOffset
		end.parent,					// endParent
		end.textNode,				// endTextNode
		end.offset					// endOffset
	];
	
	Zotero.DB.query(query, parameters);	
}

/**
 * Un-highlights a range. 
 *
 * mode can be:
 *     0: unhighlight all
 *     1: unhighlight from start to point
 *     2: unhighlight from point to end
 **/
Zotero.Highlight.prototype.unhighlight = function(container, offset, mode) {
	var textType = Components.interfaces.nsIDOMNode.TEXT_NODE;
	
	if(mode == 1) {
		this.range.setStart(container, offset);
	} else if(mode == 2) {
		this.range.setEnd(container, offset);
	}
	
	for(var i=0; i<this.spans.length; i++) {
		var span = this.spans[i];
		var parentNode = span.parentNode;
		
		if(mode != 0 && span.isSameNode(container.parentNode) && offset != 0) {
			if(mode == 1) {
				// split text node
				var textNode = container.splitText(offset);
				this.range.setStart(textNode, 0);
				
				if(span.nextSibling && span.nextSibling.nodeType == span.lastChild == textType) {
					// attach last node to next text node if possible
					span.nextSibling.nodeValue = span.lastChild.nodeValue + span.nextSibling.nodeValue;
					span.removeChild(span.lastChild);
				}
				
				// loop through, removing nodes
				var node = span.firstChild;
				
				while(span.firstChild && !span.firstChild.isSameNode(textNode)) {
					parentNode.insertBefore(span.removeChild(span.firstChild), span);
				}
			} else if(mode == 2) {
				// split text node
				var textNode = container.splitText(offset);
				
				if(span.previousSibling && span.previousSibling.nodeType == span.firstChild == textType) {
					// attach last node to next text node if possible
					span.previousSibling.nodeValue += span.firstChild.nodeValue;
					span.removeChild(span.firstChild);
				}
				
				// loop through, removing nodes
				var node = textNode;
				var child = node;
				
				while(node) {
					child = node;
					node = node.nextSibling;
					
					span.removeChild(child);
					parentNode.insertBefore(child, span.nextSibling);
				}
				
				this.range.setEnd(textNode, 0);
			}
		} else if(mode == 0 || !this.range.isPointInRange(span, 1) && parentNode) {
			Zotero.debug("point is in range");
			
			// attach child nodes before
			while(span.hasChildNodes()) {
				Zotero.debug("moving "+span.firstChild.textContent);
				parentNode.insertBefore(span.removeChild(span.firstChild), span);
			}
			
			// remove span from DOM
			parentNode.removeChild(span);
			
			// remove span from list
			this.spans.splice(i, 1);
			i--;
		}
	}
}

Zotero.Highlight.prototype._highlight = function() {
	Zotero.Annotate.normalizeRange(this.range);
	
	var startNode = this.range.startContainer;
	var endNode = this.range.endContainer;
	
	var ancestor = this.range.commonAncestorContainer;
	
	var onlyOneNode = startNode.isSameNode(endNode);
	
	if(!onlyOneNode) {
		// highlight nodes after start node in the DOM hierarchy not at ancestor level
		while(startNode.parentNode && !startNode.parentNode.isSameNode(ancestor)) {
			if(startNode.nextSibling) {
				this._highlightSpaceBetween(startNode.nextSibling, startNode.parentNode.lastChild);
			}
			
			startNode = startNode.parentNode;
		}
		// highlight nodes after end node in the DOM hierarchy not at ancestor level
		while(endNode.parentNode && !endNode.parentNode.isSameNode(ancestor)) {
			if(endNode.previousSibling) {
				this._highlightSpaceBetween(endNode.parentNode.firstChild, endNode.previousSibling);
			}
			
			endNode = endNode.parentNode;
		}
		// highlight nodes between start node and end node at ancestor level
		if(!startNode.isSameNode(endNode.previousSibling)) {
			this._highlightSpaceBetween(startNode.nextSibling, endNode.previousSibling);
		}
	}
	
	// split the end off the existing node
	if(this.range.endContainer.nodeType == Components.interfaces.nsIDOMNode.TEXT_NODE && this.range.endOffset != 0) {
	Zotero.debug("using end range");
		if(this.range.endOffset != this.range.endContainer.nodeValue) {
			var textNode = this.range.endContainer.splitText(this.range.endOffset);
			Zotero.debug("split along "+textNode.textContent);
		}
		if(!onlyOneNode) {
			this._highlightTextNode(this.range.endContainer);
		}
		if(textNode) this.range.setEnd(textNode, 0);
	}
	
	// split the start off of the first node
	if(this.range.startContainer.nodeType == Components.interfaces.nsIDOMNode.TEXT_NODE) {
		if(this.range.startOffset == 0) {
			var highlightNode = this.range.startContainer;
		} else {
			var highlightNode = this.range.startContainer.splitText(this.range.startOffset);
		}
		var span = this._highlightTextNode(highlightNode);
		this.range.setStart(span.firstChild, 0);
	} else {
		this._highlightSpaceBetween(this.range.startContainer, this.range.startContainer);
	}
}

Zotero.Highlight.prototype._highlightTextNode = function(textNode) {
	var parent = textNode.parentNode;
	if(parent.getAttribute("zotero") == "highlight") {
		// already highlighted
		return parent;
	}
	
	var nextSibling = textNode.nextSibling;
	if(nextSibling && nextSibling.getAttribute &&
	  nextSibling.getAttribute("zotero") == "highlight") {
		// next node is highlighted
		parent.removeChild(textNode);
		nextSibling.insertBefore(textNode, nextSibling.firstChild);
		return nextSibling;
	}
	
	var previousSibling = textNode.previousSibling;
	if(previousSibling && previousSibling.getAttribute &&
	  previousSibling.getAttribute("zotero") == "highlight") {
		// previous node is highlighted
		parent.removeChild(textNode);
		previousSibling.appendChild(textNode);
		return previousSibling;
	}
	
	var span = this.document.createElement("span");
	span.setAttribute("zotero", "highlight");
	span.style.display = "inline";
	span.style.backgroundColor = Zotero.Annotate.highlightColor;
	
	parent.removeChild(textNode);
	span.appendChild(textNode);
	parent.insertBefore(span, (nextSibling ? nextSibling : null));
	
	this.spans.push(span);
	
	return span;
}

Zotero.Highlight.prototype._highlightSpaceBetween = function(start, end) {
	var meaningfulRe = /[^\s\r\n]/;
	
	var node = start;
	var text;
	
	while(node) {
		// process nodes
		if(node.nodeType == Components.interfaces.nsIDOMNode.TEXT_NODE) {
			var textArray = [node];
		} else {
			var texts = this.document.evaluate('.//text()', node, this.nsResolver,
				Components.interfaces.nsIDOMXPathResult.ANY_TYPE, null);
			var textArray = new Array()
			while(text = texts.iterateNext()) textArray.push(text);
		}
		
		// do this in the middle, after we're finished with node but before we
		// add any spans
		if(node.isSameNode(end)) {
			node = false;
		} else {
			node = node.nextSibling;
		}
		
		for each(var textNode in textArray) {
			this._highlightTextNode(textNode);
		}
	}
}