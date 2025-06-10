const canvas = document.getElementById('drawCanvas');
const eqnLabel = document.getElementById('eqnLabel');
const ctx = canvas.getContext('2d');
const tableBody = document.getElementById('pointTableBody');
const toggleBtn = document.getElementById('toggleFunction');
const functionSelect = document.getElementById('functionSelect');

// For drawing
let currentMousePos = null;
let drawing = false;

// for zooming/panning
let isHandToolActive = false;
let scaleY = 1;
let scaleX = 1;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;
const MAX_ZOOM = 5;
const MIN_ZOOM = 0.5;

// for toolbar scrolling
const toolbar = document.querySelector('.toolbar');
let isDown = false;
let startX = 0;
let scrollLeft = 0;

// for table scrolling
const tableScroll = document.querySelector('.table-scroll');
let tableIsDown = false;
let tableStartX = 0;
let tableScrollLeft = 0;

// For setting range of the x- and y- values
const Y_SCALE_FACTOR = 2; 
const INITIAL_ZOOM = 2;  
const FINAL_ZOOM = 1;   

/** 'f', 'g', or 'h' */
let currentFunc = 'f'; 

let F = [];
let G = [];

// Scaled Convex approx.
let convexF = [];
let convexScaledF = []
let peakIdxF = null;
let errorF = null;

let convexG = [];
let convexScaledG = []
let peakIdxG = null;
let errorG = null;

// Flipped Convex approx.
let convexFlippedF = [];
let convexFlippedG = [];


const gColors = {
  raw:        { color: 'rgb(255, 100, 0)',     linewidth: 1 },
  main:       { color: 'rgba(255, 187, 160, 0.6)', linewidth: 2.5 },
  scaled:     { color: 'rgb(255, 190, 80)',    linewidth: 1 },
  scaledPeak: { color: 'rgb(180, 40, 0)', radius:2.5 },
  flipped:    { color: 'rgb(255, 150, 40)',    linewidth: 1 },
  left:  { color: 'rgb(151, 2, 94)',    linewidth: 1 },
  right:  { color: 'rgb(151, 2, 94)',    linewidth: 1 },
};

const fColors = {
  raw:        { color: 'rgb(0, 100, 180)',     linewidth: 1 },
  main:       { color: 'rgba(150, 220, 255, 0.6)', linewidth: 2.5 },
  scaled:     { color: 'rgb(80, 200, 210)',    linewidth: 1 },
  scaledPeak: { color: 'rgb(0, 60, 120)', radius:2.5},
  flipped:    { color: 'rgb(40, 140, 220)',    linewidth: 1 },
  left:  { color: 'rgb(67, 46, 255)',    linewidth: 1 },
  right:  { color: 'rgb(67, 46, 255)',    linewidth: 1 },
};

const fgColors = {
  minFlipped:   { color: 'rgb(0,255,0)', linewidth: 3, lineDash: [3, 5] },
  maxFlipped:   { color: 'rgb(255,0,255)', linewidth: 3, lineDash: [3, 5] },
  minUnflipped:   { color: 'rgb(0, 95, 0)', linewidth: 3, lineDash: [2, 2] },
  maxUnflipped:   { color: 'rgb(158, 3, 158)', linewidth: 3, lineDash: [2, 2] },
  union:  { color: 'rgb(26,188,156)', linewidth: 5, lineDash: [2, 4] },
  intersect:  { color: 'rgb(231,76,60)', linewidth: 5, lineDash: [2, 4] },
  join:  { color: 'rgb(255, 0, 140)', linewidth: 3 },
  meet: { color: 'rgb(2, 51, 2)', linewidth: 3 }

}



// **************************************************
// Canvas Setup
// **************************************************

/**
 * Sets the canvas size
 */
function setCanvasSize() {
  canvas.style.width = '80vw';
  canvas.style.height = '80vh';
  canvas.style.maxWidth = 'none';
  canvas.style.maxHeight = 'none';
  resizeCanvasToMatchDisplaySize();
}

/**
 * Matches canvas pixel dimensions to its display size
 */
function resizeCanvasToMatchDisplaySize() {
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    // Calculate visible area 
    const currentLeft = -offsetX / (canvas.width * scaleX);
    const currentTop = -offsetY / (canvas.height * scaleY);
  
    // Update canvas size
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    
    // Recalculate offsets to keep same visible area
    offsetX = -currentLeft * canvas.width * scaleX;
    offsetY = -currentTop * canvas.height * scaleY;
    
    // Don't show area outside the graph
    offsetX = Math.min(0, Math.max(canvas.width * (1 - scaleX), offsetX));
    offsetY = Math.min(0, Math.max(canvas.height * (1 - scaleY), offsetY));
    
    redrawCanvas();
  }
}

/**
 * Convert normalized coordinates to screen pixel coordinates
 * @param {number} normX - normalized x value between 0 - 1
 * @param {number} normY  - normalized y value between 0 - 2
 * @returns {Object} - screen coordinates {x, y} in pixels
*/
function normalizedToScreen(normX, normY) {
  return {
    x: (normX * canvas.width * scaleX) + offsetX,
    y: ((1 - normY/Y_SCALE_FACTOR) * canvas.height * scaleY) + offsetY
  };
}

/**
 * Convert screen pixel coordinates to normalized coordinates (0-1 range)
 * @param {number} screenX - x value of screen pixel
 * @param {number} screenY - y value of screen pixel
 * @returns {Object} normalized coordinates {x, y} 
 */
function screenToNormalized(screenX, screenY) {
  return {
    x: (screenX - offsetX) / (canvas.width * scaleX), 
    y: (1 - ((screenY - offsetY) / (canvas.height * scaleY))) * Y_SCALE_FACTOR
  };
}


/**
 * Converts screen coordinates to normalized canvas coordinates {x,y}
 * where  x, y ∈ [0,1] range and (0,0) is the bottom left corner
 * @param {Event} e - Mouse or touch event
 * @returns {Object} - Normalized coordinated of the form {x, y}
 */
function transformFromCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  let x, y;
  
  if (e.touches) {
    // For touch events
    const touch = e.touches[0];
    x = touch.clientX - rect.left;
    y = touch.clientY - rect.top;
  } else {
    // For mouse events
    x = e.clientX - rect.left;
    y = e.clientY - rect.top;
  }
  
  return screenToNormalized(x, y);
}

/**
 * Draws 10x10 grid lines on the canvas.
 */
function drawGridLines() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scaleX, scaleY);

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.lineWidth = 0.5;
  
  // Vertical gridlines every 0.1 units
  for (let x = 0; x <= 1; x += 0.1) {
    const pixelX = x * canvas.width;
    ctx.beginPath();
    ctx.moveTo(pixelX, 0);
    ctx.lineTo(pixelX, canvas.height);
    ctx.stroke();
  }
  
  
  // Horizontal gridlines every 0.1 units
  for (let y = 0; y <= Y_SCALE_FACTOR; y += 0.1) {
    const pixelY = (1 - y/Y_SCALE_FACTOR) * canvas.height;
    ctx.beginPath();
    ctx.moveTo(0, pixelY);
    ctx.lineTo(canvas.width, pixelY);
    ctx.stroke();
  }
  
  // Axes
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.lineWidth = 1;
  
  // Y-axis left edge
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, canvas.height);
  ctx.stroke();
  
  // X-axis bottom edge
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.stroke();
  
  ctx.restore();
}


/**
 * Draws 0 at the orgin, 1 on the x- and y- axis,
 * and 2 at the end of the y-axis
 */
function drawAxes() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  const zeroPos = normalizedToScreen(0, 0);
  const oneXPos = normalizedToScreen(1, 0);
  const oneYPos = normalizedToScreen(0, 1);
  const twoYPos = normalizedToScreen(0, Y_SCALE_FACTOR);
  
  ctx.fillStyle = '#000';
  ctx.font = '12px Arial';
  ctx.fillText('0', zeroPos.x + 5, zeroPos.y - 5);
  ctx.fillText('1', oneXPos.x - 15, oneXPos.y - 5);
  ctx.fillText('1', oneYPos.x + 5, oneYPos.y + 15);

  if (Y_SCALE_FACTOR != 1){
    ctx.fillText(Y_SCALE_FACTOR, twoYPos.x + 5, twoYPos.y + 15);
  }
  
  ctx.restore();
}


// **************************************************
// Zooming/panning
// **************************************************


/**
 * Toggles the panning tool on/off.
 * When panning is on, switches the cursor to
 * 'grab' and disables drawing functionality
 * @note - called when the handtool button is clicked
 */
function toggleHandTool() {
  isHandToolActive = !isHandToolActive;
  const handToolBtn = document.getElementById('handTool');
  handToolBtn.classList.toggle('active', isHandToolActive);
  
  if (isHandToolActive) {
    canvas.style.cursor = 'grab';
  } else {
    canvas.style.cursor = 'default';
    isPanning = false;
  }
}

/**
 * Zooms the canvas by zoomFactor, while keeping 
 * the canvas centered
 * @param {number} zoomFactor - Multiplicative zoom factor (e.g., 1.2 = 120%)
 * @note - called when user clicks + or - buttons
 */
function zoomCanvas(zoomFactor) {
  // Calculate new scale with constraints
  const newScaleX = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scaleX * zoomFactor));
  const newScaleY = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scaleY * zoomFactor));
  
  // Adjust offsets to zoom toward center
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  offsetX = centerX - (centerX - offsetX) * (newScaleX / scaleX);
  offsetY = centerY - (centerY - offsetY) * (newScaleY / scaleY);
  
  scaleX = newScaleX;
  scaleY = newScaleY;
  redrawCanvas();
}

/**
 * Zooms the y-axis by an absolute zoom level, maintaining
 * bottom left positioning and animating the transition
 * @param {number} zoom_amount - Target absolute zoom level
 */
function zoomY(zoom_amount) {
  const targetScale = zoom_amount;
  const targetOffsetY = canvas.height * (1 - targetScale);

  const zoomSteps = 20;
  const scaleStep = (targetScale - scaleY) / zoomSteps;
  const offsetYStep = (targetOffsetY - offsetY) / zoomSteps;
  
  const animateZoom = () => {
    // Only modify y-related values
    scaleY += scaleStep;
    offsetY += offsetYStep;
    
    redrawCanvas();
    
    if (Math.abs(scaleY - targetScale) > 0.01) {
      requestAnimationFrame(animateZoom);
    } else {
      // Final adjustment
      scaleY = targetScale;
      offsetX = 0; // Ensure x stays at left edge
      offsetY = targetOffsetY;
      redrawCanvas();
    }
  };
  
  animateZoom();
}

/**
 * Handles mouse movement during panning,
 * updating canvas offsets based on mouse delta
 * @param {MouseEvent} e - Mouse event
 * @note - called when the the user moves their mouse on the canvas
 */
function handlePanMove(e) {
  if (!isHandToolActive || !isPanning) return;
  
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  // Calculate delta movement in screen coordinates
  const dx = mouseX - lastPanX;
  const dy = mouseY - lastPanY;
  
  // Apply the delta directly to the offset
  offsetX += dx;
  offsetY += dy;
  
  // Update last position (in screen coordinates)
  lastPanX = mouseX;
  lastPanY = mouseY;
  
  redrawCanvas();
  e.preventDefault();
}

/**
 * Starts panning operation, storing the mouse coordinates
 * for delta calculations and changing the cursor to 'grabbing'
 * @param {MouseEvent} e - Mouse event object
 * @note - called when user clicks and drags while in panning mode
 */
function handlePanStart(e) {
  if (!isHandToolActive) return;
  
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  // Store both screen coordinates and transformed coordinates
  lastPanX = mouseX;
  lastPanY = mouseY;
  
  isPanning = true;
  canvas.style.cursor = 'grabbing';
  e.preventDefault();
}

/**
 *  Ends panning operation, setting isPanning to false
 * and changing the cursor to 'grab'
 */
function handlePanEnd() {
  if (!isHandToolActive) return;
  
  isPanning = false;
  canvas.style.cursor = 'grab';
}


/**
 * Position the canvas to its inital state,
 * with (0,0) in the bottom left corner and
 * and x,y in range [0,1]
 */
function resetView() {
  scaleX = 1;
  scaleY = INITIAL_ZOOM;
  offsetX = 0;
  offsetY = canvas.height * (1 - scaleY);
  redrawCanvas();
}


// **************************************************
// Handle Drawing
// **************************************************



// Function to switch between f and g
function toggleFunction() {
  currentFunc = currentFunc === 'f' ? 'g' : 'f';
  drawing = false;
  redrawCanvas();
  
  // Update UI to show which function is being drawn
  toggleBtn.textContent = `Drawing: ${currentFunc.toUpperCase()}`;
}

/**
 * Checks if a point is within the bounds x ∈ [0,1] y ∈ [0,1]
 * @param {number} x - x-value
 * @param {number} y - y-value
 * @returns - True if the element within the bounds  x ∈ [0,1] y ∈ [0,1]
 * and false otherwise
 */
function isPointInBounds(x, y) {
  return x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

/**
 * Starts a new drawing, clears points, and stores initial position.
 * @param {MouseEvent} e - Mouse Event
 */
function startDraw(e) {
  if (isHandToolActive) return; // Don't draw when hand tool is active
  const pos = transformFromCanvas(e);
  if (isPointInBounds(pos.x, pos.y)) {
    drawing = true;
    resetView();
    clearFuncVars(currentFunc)
    redrawCanvas();
  }
  e.preventDefault();
}

function clearFuncVars(label){
  if(label === 'f'){
    F = [];
    convexF = [];
    convexScaledF = []
    convexFlippedF = [];
    peakIdxF = null;
  }else{
    G = [];
    convexG = [];
    convexScaledG = []
    convexFlippedG = [];
    peakIdxG = null;
  }

}

/* 
  Adds current mouse position to points array during drawing
  Constructs F and G as [{x:x1, y:y1}, {x:x2, y:y2}, ...]
  Input: 
  e - Mouse event
*/
function draw(e) {
  const pos = transformFromCanvas(e);

  // Update mouse position
  currentMousePos = {
    x: pos.x,
    y: pos.y,
    rawX: pos.x * canvas.width,
    rawY: (1 - pos.y) * canvas.height
  };

  if (!drawing || isHandToolActive || !isPointInBounds(pos.x, pos.y)) { 
    redrawCanvas();
    return;
  }

  if (currentFunc === 'f') {
    F.push(pos);
  } else {
    G.push(pos);
  }
    
  redrawCanvas();
  e.preventDefault();
}

/*
  Input: 
  e - Mouse event 

  Calls methods to process points and and compute the regression.
*/
function endDraw(e) {
  drawing = false;
  // Process points and generate table
  if (currentFunc === 'f' && F.length > 0) {
    manipulateGraph('f');
  } else if (currentFunc === 'g' && G.length > 0) {
    manipulateGraph('g');
  }
  e.preventDefault();
}



function drawPath(points, style) {
  if (!points || points.length === 0) return;
  
  ctx.save(); 

  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.linewidth || 1;
  ctx.setLineDash(style.lineDash || []);
  
  ctx.beginPath();
  const start = normalizedToScreen(points[0][0], points[0][1]);
  ctx.moveTo(start.x, start.y);
  
  for (let i = 1; i < points.length; i++) {
    const p = normalizedToScreen(points[i][0], points[i][1]);
    ctx.lineTo(p.x, p.y);
  }
  
  ctx.stroke();
  ctx.restore();
}


/**
 * Creates the control panel with graph visibility options
 */
function createControlPanel() {
  const existing = document.getElementById('graph-controls');
  if (existing) return;

  // Toggle button
  const toggleButton = document.createElement('button');
  toggleButton.id = 'control-toggle';
  toggleButton.innerHTML = '&#9776;';
  

  toggleButton.style.position = 'absolute';
  toggleButton.style.zIndex = '1001';
  toggleButton.style.padding = '10px';
  toggleButton.style.borderRadius = '5px';
  toggleButton.style.backgroundColor = '#2c3e50';
  toggleButton.style.color = 'white';
  toggleButton.style.border = 'none';
  toggleButton.style.cursor = 'pointer';
  toggleButton.style.fontSize = '20px';
  document.body.appendChild(toggleButton);

  // Panel container
  const controls = document.createElement('div');
  controls.id = 'graph-controls';
  controls.classList.add('collapsed');  // Initial state is collapsed
  document.body.appendChild(controls);

  // Title
  const title = document.createElement('h3');
  title.textContent = 'Graph Controls';
  controls.appendChild(title);

  // Helper to group controls
  const createGroup = (heading) => {
    const group = document.createElement('div');
    const groupTitle = document.createElement('h4');
    groupTitle.textContent = heading;
    group.appendChild(groupTitle);
    return group;
  };

  
  const groups = [
    {
      heading: 'Basic',
      options: [
        { id: 'show-f', label: 'f' },
        { id: 'show-g', label: 'g' },
        { id: 'show-convexF', label: 'f<sub>c</sub>' },
        { id: 'show-convexG', label: 'g<sub>c</sub>' },
        { id: 'show-flippedF', label: 'f<sub>c</sub><sup>Flip</sup>' },
        { id: 'show-flippedG', label: 'g<sub>c</sub><sup>Flip</sup>' },
      ]
    },
    {
      heading: 'Min/Max Operations',
      options: [
        { id: 'show-flippedMin', label: 'min{f<sub>c</sub><sup>Flip</sup>, g<sub>c</sub><sup>Flip</sup>}' },
        { id: 'show-flippedMax', label: 'max{f<sub>c</sub><sup>Flip</sup>, g<sub>c</sub><sup>Flip</sup>}' },
        { id: 'show-unflippedMin', label: 'min{f<sub>c</sub><sup>Flip</sup>, g<sub>c</sub><sup>Flip</sup>}<sup>Unflip</sup>' },
        { id: 'show-unflippedMax', label: 'max{f<sub>c</sub><sup>Flip</sup>, g<sub>c</sub><sup>Flip</sup>}<sup>Unflip</sup>' }
      
      ]

    },
    {
      heading: 'Union/Intersection',
      options: [
        { id: 'show-pwUnion', label: 'f ∨ g' },
        { id: 'show-pwIntersect', label: 'f ∧ g' }
      ]
    },
    {
      heading: 'Least Increasing/Decreasing',
      options: [
        { id: 'show-fLeft', label: 'f<sup>L</sup>' },
        { id: 'show-gLeft', label: 'g<sup>L</sup>' },
        { id: 'show-fRight', label: 'f<sup>R</sup>' },
        { id: 'show-gRight', label: 'g<sup>R</sup>' }
      ]
    },
    {
      heading: 'Join/Meet',
      options: [
        { id: 'show-join', label: 'f ⊔ g (Join)' },
        { id: 'show-meet', label: 'f ⊓ g (Meet)' }
      ]
    }
  ];

  groups.forEach(group => {
    const groupElement = createGroup(group.heading);
    group.options.forEach(opt => {
      const div = document.createElement('div');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = opt.id;
      const label = document.createElement('label');
      label.htmlFor = opt.id;
      label.innerHTML = opt.label;
      div.appendChild(checkbox);
      div.appendChild(label);
      groupElement.appendChild(div);
    });
    controls.appendChild(groupElement);
  });

  toggleButton.addEventListener('click', () => {
    controls.classList.toggle('collapsed');
    toggleButton.innerHTML = controls.classList.contains('collapsed') ? '&#9776;' : '&times;';
  });
  
}


/*
  Draws the convex approximation with all check-marked graphs
  @param {string} label - 'f' or 'g' to specify which function to draw
*/
function drawConvexApproximation() {

  function drawFuncPoints(func, color){
    ctx.fillStyle = color;
    func.forEach(p => {
      const screen = normalizedToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 2, 0, 2 * Math.PI);
      ctx.fill();
    });
  }
  
  if (document.getElementById('show-f')?.checked && F?.length && convexF?.length) {
    drawFuncPoints(F, fColors.raw.color)
    drawPoints(F, fColors.raw.color);
    drawPath(convexF, fColors.main);
  }

  if (document.getElementById('show-g')?.checked && G?.length && convexG?.length) {
    drawFuncPoints(G, gColors.raw.color)
    drawPoints(G, gColors.raw.color);
    drawPath(convexG, gColors.main);
  }


  // Scaled concave
  if (document.getElementById('show-convexF')?.checked && convexScaledF?.length) {
    drawPath(convexScaledF, fColors.scaled);
    drawPeakPoint(convexScaledF, peakIdxF, fColors.scaledPeak);
    
  }
  if (document.getElementById('show-convexG')?.checked && convexScaledG?.length) {
    drawPath(convexScaledG, gColors.scaled);
    drawPeakPoint(convexScaledG, peakIdxG, gColors.scaledPeak);
  }

  // Flipped scaled concave graph
  if (document.getElementById('show-flippedF')?.checked && convexFlippedF?.length) {
    drawPath(convexFlippedF, fColors.flipped);
  }
  if (document.getElementById('show-flippedG')?.checked && convexFlippedG?.length) {
    drawPath(convexFlippedG, gColors.flipped);
  }

  // Min/Max regions if flippedF and flippedF
  if (convexFlippedF?.length && convexFlippedG?.length) {
    drawMinMaxRegions();
  }

  // Pointwise operations 
  drawJoinMeet()

  updateEquationLabel();
}

// Helper function to draw peak points
function drawPeakPoint(points, peakIdx, style) {
  if (!points?.[peakIdx]) return;
  
  const peak = points[peakIdx];
  const screen = normalizedToScreen(peak[0], peak[1]);
  ctx.fillStyle = style.color;
  ctx.beginPath();
  ctx.arc(screen.x, screen.y, style.radius, 0, 2 * Math.PI);
  ctx.fill();
}


function drawMinMaxRegions() {
  const showMin = document.getElementById('show-flippedMin')?.checked;
  const showMax = document.getElementById('show-flippedMax')?.checked;
  const showUnflippedMin = document.getElementById('show-unflippedMin')?.checked;
  const showUnflippedMax = document.getElementById('show-unflippedMax')?.checked;

  if (!showMin && !showMax & !showUnflippedMin & !showUnflippedMax) return;

  const minPoints = [];
  const maxPoints = [];

  for (let i = 0; i < convexFlippedF.length; i++) {
    const fPoint = convexFlippedF[i];
    const gPoint = convexFlippedG[i];
    if (!fPoint || !gPoint) continue;
    
    const x = fPoint[0];
    const minY = Math.min(fPoint[1], gPoint[1]);
    const maxY = Math.max(fPoint[1], gPoint[1]);
    minPoints.push([x, minY]);
    maxPoints.push([x, maxY]);
  }

  if (showMin) drawPath(minPoints, fgColors.minFlipped);
  if (showMax) drawPath(maxPoints, fgColors.maxFlipped);

  if (showUnflippedMin){
    const unflippedMin = flipVertically(minPoints)
    drawPath(unflippedMin, fgColors.minUnflipped)
  }

  if (showUnflippedMax){
    const unflippedMax = flipVertically(maxPoints)
    drawPath(unflippedMax, fgColors.maxUnflipped)
  }
}


function drawJoinMeet() {
  // Calculate all needed operations
  
  let fLeft;
  let fRight;
  if(convexScaledF?.length){
    fLeft = calculateLeastIncreasing(convexScaledF);
    fRight = calculateLeastDecreasing(convexScaledF);

    if (document.getElementById('show-fLeft')?.checked && fLeft.length) {
      drawPath(fLeft, fColors.left);
    }         
    
    if (document.getElementById('show-fRight')?.checked && fRight.length) {
      drawPath(fRight, fColors.right);
    }
    
  }
 
  let gLeft;
  let gRight;
  if(convexScaledG?.length){
    gLeft = calculateLeastIncreasing(convexScaledG);
    gRight = calculateLeastDecreasing(convexScaledG);

    if (document.getElementById('show-gLeft')?.checked && gLeft.length) {
      drawPath(gLeft, gColors.left);
    }
  
    if (document.getElementById('show-gRight')?.checked && gRight.length) {
      drawPath(gRight, gColors.right);
    }
  }

  
  // Return unless both f and g are populated
  if(!(convexScaledF?.length && convexScaledG?.length)) {return;}


  const pointwiseMax = convexScaledF.map(([x, y1], i) => {
    const [, y2] = convexScaledG[i];
    return [x, Math.max(y1, y2)];
  });

  const pointwiseMin = convexScaledF.map(([x, y1], i) => {
    const [, y2] = convexScaledG[i];
    return [x, Math.min(y1, y2)];
  });

  
  if (document.getElementById('show-pwUnion')?.checked) {
    drawPath(pointwiseMax, fgColors.union);
  }
  if (document.getElementById('show-pwIntersect')?.checked) {
    drawPath(pointwiseMin, fgColors.intersect);
  }

  
  if (document.getElementById('show-join')?.checked && fLeft.length && gLeft.length) {
    let join = calculateJoin(pointwiseMax, fLeft, gLeft);
    drawPath(join, fgColors.join);
  }

  if (document.getElementById('show-meet')?.checked && fRight.length && gRight.length) {
    let meet = calculateMeet(pointwiseMax, fRight, gRight);
    drawPath(meet, fgColors.meet);
  }
}



function updateEquationLabel(value) {
  let labelText = '';

  labelText = `<div style="color: black;">`;  // Wrap all in a black-colored container

  if (F.length > 0) {
    labelText += `
      <div>
        <span style="position: relative; display: inline-block; padding: 0 6px; line-height: 1.2; border-bottom: ${fColors.raw.linewidth || 2}px solid ${fColors.raw.color};">
          f(x)
          <span style="
            position: absolute;
            bottom: 0; /* aligns with the bottom border */
            left: 50%;
            transform: translate(-50%, 50%);
            width: 6px;
            height: 6px;
            background-color: ${fColors.raw.color};
            border-radius: 50%;
            pointer-events: none;
          "></span>
        </span>
        |
        <span style="border-bottom: ${fColors.scaled.linewidth || 2}px solid ${fColors.scaled.color}; padding: 2px;">
          f(x)<sub>c</sub>
        </span>
        |
        <span style="display: inline-flex; align-items: center;">
          <span style="
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: ${fColors.scaledPeak.color};
            margin-right: 5px;
          "></span>
          Convex Peak X: ${convexF?.[peakIdxF]?.[0]?.toFixed(2) ?? 'N/A'}
        </span>
        |
        <span>
          Convex Error: ${errorF?.toFixed(4) ?? 'N/A'}
        </span>
      </div>
    `;


  }

  if (G.length > 0) {
    labelText += `
      <div>
        <span style="position: relative; display: inline-block; padding: 0 6px; line-height: 1.2; border-bottom: ${gColors.raw.linewidth || 2}px solid ${gColors.raw.color};">
          g(x)
          <span style="
            position: absolute;
            bottom: 0; /* aligns with the bottom border */
            left: 50%;
            transform: translate(-50%, 50%);
            width: 6px;
            height: 6px;
            background-color: ${gColors.raw.color};
            border-radius: 50%;
            pointer-events: none;
          "></span>
        </span>
        |
        <span style="border-bottom: ${gColors.scaled.linewidth || 2}px solid ${gColors.scaled.color}; padding: 2px;">
          g(x)<sub>c</sub>
        </span>
        |
        <span style="display: inline-flex; align-items: center;">
          <span style="
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: ${gColors.scaledPeak.color};
            margin-right: 5px;
          "></span>
          Convex Peak X: ${convexG?.[peakIdxG]?.[0]?.toFixed(2) ?? 'N/A'}
        </span>
        |
        <span>
          Convex Error: ${errorG?.toFixed(4) ?? 'N/A'}
        </span>
      </div>
    `;

  }


  labelText += `</div>`; // Close the black color container

  eqnLabel.innerHTML = labelText;
}


// **************************************************
// Computing Best Convex Fit
// **************************************************


/*
  Given an array of x- and y-values, returns the monotonic
  (non-decreasing or non-inceasing) array of y-values that best 
  matches the original function using
  the PAVA (Pool Adjacent Violators Algorithm) to for isotonic 
  regression
 
  Input:
  xVals - array of x-values (in increasing order)
  yVals - array of y-values
  increasing - true (default) for increasing regression, false for decreasing

  Output:
  Array of y-values representing the best monotonic fit

  Time complexity: O(n)
*/
function isotonicRegression(xVals, yVals, increasing = true) {
  const n = yVals.length;
  const y = yVals.slice();  
  const x = xVals.slice();  
  // Compute weights based on spacing between x-values
  const weights = x.slice(1).map((x1, i) => x1 - x[i]);  
  weights.unshift(weights[0]); // Assign first weight 

  let values = y.slice();
  let w = weights.slice();
  let index = Array.from({ length: n }, (_, i) => [i, i]);

  let i = 0;
  while (i < values.length - 1) {
    const violation = increasing ? values[i] > values[i + 1] : values[i] < values[i + 1];
    if (violation) {
      // merge the two values by combine their weights
      // and replacing  both values with the weighted average
      const wSum = w[i] + w[i + 1];
      const avg = (w[i] * values[i] + w[i + 1] * values[i + 1]) / wSum;
      values.splice(i, 2, avg);
      w.splice(i, 2, wSum);
      index.splice(i, 2, [index[i][0], index[i + 1][1]]);

      // Step back to check if the new value causes a new violation with the previous one.
      i = Math.max(0, i - 1);
    } else {
      i++;
    }
  }

  // Violations fixed
  // Assign the average value of each block to every original index in that block.
  const result = new Array(n);
  for (let j = 0; j < values.length; j++) {
    for (let k = index[j][0]; k <= index[j][1]; k++) {
      result[k] = values[j];
    }
  }

  return result;
}


/**
 * Given x- and y-values, returns the best piecewise isotonic regression 
 * that is increasing to a peak, then decreasing.
 * @param {array} points - array of coordinates 
 * of form [[x:0.01, y:y1], [x:0.02, y:y2], ... [x:1, y:101]]
 * @returns  
    - fit: best convex fit, represented as an array of form
      [[x:0.01, y:y1], [x:0.02, y:y2], ... [x:1, y:101]]
    - peakIndex: index of the peak
    - error: total squared error of the best fit
   @note Time complexity is O(n^2)
 */
function solveConvexRegression(points) {
  const xValues = points.map(p => p.x);
  const yValues = points.map(p => p.y);
  const n = xValues.length;
  
  if (n < 3) return null;

  let bestError = Infinity;
  let bestFit = null;
  let bestPeakIndex = 0;

  // For each 0 <= j <= n
  for (let j = 1; j < n - 1; j++) {

    // Split into two regions around j
      // [0 ... j]
    const leftX = xValues.slice(0, j + 1);
    const leftY = yValues.slice(0, j + 1);

      // [j+1 ... n]
    const rightX = xValues.slice(j+1);
    const rightY = yValues.slice(j+1);

    // Apply isotonic regression both the left and right sides
    const leftFitY = isotonicRegression(leftX, leftY, true);   // Increasing
    const rightFitY = isotonicRegression(rightX, rightY, false); // Decreasing

    // Calculate error
    const leftError = calculateError(leftY, leftFitY);
    const rightError = calculateError(rightY, rightFitY);
    const error = leftError + rightError;

    
    if (error >= bestError) continue; // Continue if this fit does not give best error

  
    // Find index of peak
    const left_j = leftFitY[j]
    const right_j_plus_1 = rightFitY[0]

    if (left_j >= right_j_plus_1){
      bestPeakIndex = j
    }else{
      bestPeakIndex = j+1
    }

    // Best fit
    const combinedFitY = [...leftFitY, ...rightFitY];
    const combinedFit = xValues.map((x, i) => [x, combinedFitY[i]]);

    bestError = error;
    bestFit = combinedFit;
   
   
  }

  return {
    fit: bestFit,
    peakIndex: bestPeakIndex,
    error: bestError
  };
}


/**
 * Scales the points so the peak y-value is 1
 * @param {*} points - array of points of form
 * [[x:0.01, y:y1], [x:0.02, y:y2], ... [x:1, y:101]]
 * representig the convex approx.
 * @param {*} peakIndex - Index of the peak point of the graph
 * @returns scaled points of form 
 * [[x:0.01, y:y1], [x:0.02, y:y2], ... [x:1, y:101]] 
 *  where the peak y-value is 1
 * 
 * FIX ME!
 */
function scalePeakOne(points, peakIndex) {
  const maxY = points[peakIndex][1]; // Get y-value at peak index
  if (maxY === 0) return points;     // Avoid division by zero
  return points.map(([x, y]) => [x, y / maxY]);
}

/**
 * Vertically flips the increasing part of the convex approx. 
 * around the peak point while keeping the decreasing part unchanged
 * @param {array} convexScaledPoints - Array of points of form
 * [[x:0.01, y:y1], [x:0.02, y:y2], ... [x:1, y:101]] representing the
 * convex approx.
 * @param {number} peakIndex - Index of the peak point
 * @returns {Array} Array of  points representing the 
 * convex approximation with the increasing part flipped
 */
function flipIncreasingPart(f, peakIdx) {
  const peakY = f[peakIdx][1]; // y-value
  return f.map(([x, y], i) => {
    if (i <= peakIdx) {
      return [x, 2 * peakY - y];
    }
    return [x, y];
  });
}


/**
 * Flips the graph vertically (around y = 1) only for points where y > 1.
 * @param {Array} points - Array of [x, y] points
 * @returns {Array} Conditionally flipped array of [x, y] points
 */
function flipVertically(points) {
  return points.map(([x, y]) => {
    return y > 1 ? [x, 2 - y] : [x, y];
  });
}



/**
 * Helper method for solveonvexRegression to
  calculate the squared error between the predicted and actual y-value
 * @param {Array} actual - array of actual y-values
 * @param {Array} predicted - array of predicted y-values
 * @returns the squared error between the predicted and actual y-value
 */
function calculateError(actual, predicted) {
  return actual.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0);
}



function calculateLeastIncreasing(points) {
  const envelope = [];
  let currentMax = -Infinity;
  for (const [x, y] of points) {
    currentMax = Math.max(currentMax, y); 
    envelope.push([x, currentMax]);      
  }
  return envelope;
}

function calculateLeastDecreasing(points) {
  const envelope = [];
  let currentMax = -Infinity;
  for (let i = points.length - 1; i >= 0; i--) {
    const [x, y] = points[i];
    currentMax = Math.max(currentMax, y);
    envelope.unshift([x, currentMax]);    
  }
  return envelope;
}

/**
 * Calculates f ⊔ g = (f ∨ g) ∧ (fL ∧ gL)
 * 
 */
function calculateJoin(union, fLeft, gLeft, ) {
  
  const join = union.map(([x, f], i) => {
    const yFLeft = fLeft[i][1];
    const yGLeft = gLeft[i][1];
    return [x, Math.min(f, Math.min(yFLeft,yGLeft))];
  });

  return join 
}

/**
 * Calculates f ⊓ g = (f ∨ g) ∧ (fR ∧ gR)
 * 
 */
function calculateMeet(union, fRight, gRight, ) {

  const meet = union.map(([x, f], i) => {
    const yFRight = fRight[i][1];
    const yGRight = gRight[i][1];
    return [x, Math.min(f, Math.min(yFRight,yGRight))];
  });

  return meet 
}


// **************************************************
//  Data Processing and UI
// **************************************************


/**
 * Proceeses the drawing into a function with
 * 101 evenly spaced points, filling in missing 
 * values using linear interpolation. 
 * @param {array} points - Array of coordinates of form 
 * [[x:x1, y:y1], [x:x1, y:y2], ...]
 * @returns an array of regularly spaced points of form
 * [[x:0.01, y:y1], [x:0.02, y:y2], ... [x:1, y:101]]
 */
function processPoints(points){
  // Sort points by ascending x-value
  points = [...points].sort((a, b) => a.x - b.x);
 
  const xStep = 0.01;
  let currentX = 0;
  let pointIndex = 0;
  const processedPoints = [];

  // Create interpolated points at regular intervals
  while (currentX <= 1.001 && pointIndex < points.length) {
    // Find the point closest to currentX
    while (pointIndex < points.length - 1 && 
          points[pointIndex + 1].x < currentX) {
      pointIndex++;
    }
    
    // Interpolate y value if needed
    let yValue;
    if (pointIndex === points.length - 1 || points[pointIndex].x >= currentX) {
      yValue = points[pointIndex].y;
    } else {
      // Linear interpolation between points
      const x0 = points[pointIndex].x;
      const x1 = points[pointIndex + 1].x;
      const y0 = points[pointIndex].y;
      const y1 = points[pointIndex + 1].y;
      const t = (currentX - x0) / (x1 - x0);
      yValue = y0 + t * (y1 - y0);
    }
    
    processedPoints.push(
    {
      x: currentX,
      y: yValue
    });
    currentX += xStep;
  }
  return processedPoints
}


// Calculate min/max of f and g
function calculateCombinedResults() {
  if (!convexF || !convexG) return;
  
  const combined = [];
  for (let i = 0; i < convexF.fit.length; i++) {
    const x = convexF.fit[i][0];
    const yF = convexF.fit[i][1];
    const yG = convexG.fit[i][1];
    
    combined.push({
      x: x,
      min: Math.min(yF, yG),
      max: Math.max(yF, yG)
    });
  }
  
  return combined
}


/**
 * Processes the drawn points by:
  - Sorting them by ascending x-value
  - Generating a set of points at x-intervals of 0.01 (from 0 to 1) using linear interpolation if needed
  - Calling solveConvexRegression to compute a convex regression fit from the processed data.
  - Calling  updateTable and redrawCanvas to update he table and canvas with the results
 * @param {string} func ('f', 'g', 'h')  - function to manipulate
 */
function manipulateGraph(func) {
  const points = func === 'f' ? [...F] : [...G];

  if (points.length < 3) {
    eqnLabel.textContent = "Need at least 3 points for " + func.label;
    return;
  }

  // Process function
  try {
    const processed = processPoints(points);
    const result = solveConvexRegression(processed);
    const scaled = scalePeakOne(result.fit, result.peakIndex)
    console.log(scaled)
    const flipped = flipIncreasingPart(scaled,result.peakIndex)
    console.log(flipped)

    if (func == 'f'){
      F = processed
      peakIdxF = result.peakIndex
      convexF = result.fit
      errorF = result.error
      convexScaledF = scaled;
      convexFlippedF = flipped
    }else {
      G = processed
      peakIdxG = result.peakIndex
      convexG = result.fit
      errorG = result.error
      convexScaledG = scaled;
      convexFlippedG = flipped
    }
 
    // redraw canvas
    updateTable();
    redrawCanvas();
    zoomY(FINAL_ZOOM)

  } catch (error) {
      eqnLabel.textContent = "Error in computation";
      console.error(error);
  }
  
}
    

/*
  Populates the HTML table with point coordinates.
*/
function updateTable() {
  tableBody.innerHTML = ''; // Clear previous table

  for (let i = 0; i <= 100; i++) {
    const x = (i / 100).toFixed(2);
    const row = document.createElement("tr");

    // Add x value cell
    const xCell = document.createElement("td");
    xCell.textContent = x;
    row.appendChild(xCell);

    // Helper to create cells with y values
    const addYCell = (point) => {
      const td = document.createElement("td");
      if (!point) {
        td.textContent = "";
        return td;
      }
      
      // Handle both object {x,y} and array [x,y] formats
      if (point.y !== undefined) {
        td.textContent = point.y.toFixed(2);
      } else if (Array.isArray(point) && point.length >= 2) {
        td.textContent = point[1].toFixed(2);
      } else {
        td.textContent = "";
      }
      return td;
    };

    // Original functions
    row.appendChild(addYCell(F[i]));
    row.appendChild(addYCell(G[i]));

    // Scaled convex approximations
    row.appendChild(addYCell(convexScaledF[i]));
    row.appendChild(addYCell(convexScaledG[i]));

    // Flipped convex functions
    const cff = convexFlippedF[i];
    const cfg = convexFlippedG[i];
    row.appendChild(addYCell(cff));
    row.appendChild(addYCell(cfg));

    // Calculate min and max of flipped functions
    const minCell = document.createElement("td");
    const maxCell = document.createElement("td");
    
    // Extract y values from flipped functions
    const getYValue = (point) => {
      if (!point) return NaN;
      let yValue;

      if (point.y !== undefined) {
        yValue = point.y;
      } else if (Array.isArray(point)) {
        yValue = point[1];
      } else {
        yValue = NaN;
      }

      return yValue;

    };

    const cffY = getYValue(cff);
    const cfgY = getYValue(cfg);

    if (!isNaN(cffY) && !isNaN(cfgY)) {
      minCell.textContent = Math.min(cffY, cfgY).toFixed(2);
      maxCell.textContent = Math.max(cffY, cfgY).toFixed(2);
    } else {
      minCell.textContent = "";
      maxCell.textContent = "";
    }

    row.appendChild(minCell);
    row.appendChild(maxCell);

    tableBody.appendChild(row);
  }
}

/*
  Draws mouse coordinates onto the canvas.
*/
function drawMouseCoordinates() {
  if (!currentMousePos) return;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  const screenPos = normalizedToScreen(currentMousePos.x, currentMousePos.y);
  
  // Determine position for label
  let labelX, labelY;
  if (screenPos.x < canvas.width / 2) {
    labelX = screenPos.x + 10;
  } else {
    labelX = screenPos.x - 100;
  }
  
  if (screenPos.y < canvas.height / 2) {
    labelY = screenPos.y + 20;
  } else {
    labelY = screenPos.y - 10;
  }
  
  // Ensure label stays within canvas
  labelX = Math.max(5, Math.min(labelX, canvas.width - 100));
  labelY = Math.max(15, Math.min(labelY, canvas.height - 5));
  
  // Draw background
  ctx.fillStyle = 'rgba(255, 255, 255, 0)';
  ctx.fillRect(labelX - 2, labelY - 12, 100, 15);
  
  // Draw coordinates
  let color = currentFunc == 'f'? fColors.raw.color: gColors.raw.color; 
  ctx.fillStyle = drawing ? color : '#000';
  ctx.font = '12px Arial';
  ctx.fillText(
    `(${currentMousePos.x.toFixed(2)}, ${currentMousePos.y.toFixed(2)})`,
    labelX,
    labelY
  );
  
  ctx.restore();
}

/*
  
  Redraws the canvas, including
  - Grid, axes, points, current curve.
  - Mouse coordinates and convex fit (if applicable)

*/
function redrawCanvas() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grey out non-editable areas of the canvas
  const topLeft = normalizedToScreen(0, 1);
  const bottomRight = normalizedToScreen(1, 0);
  const boxWidth = bottomRight.x - topLeft.x;
  
  ctx.fillStyle = 'rgba(200, 200, 200, 0.2)';
  
  // above y=1
  ctx.fillRect(topLeft.x, 0, boxWidth, topLeft.y);
  
  // below y=0
  ctx.fillRect(topLeft.x, bottomRight.y, boxWidth, canvas.height - bottomRight.y);
  
  // left of x=0
  ctx.fillRect(0, 0, topLeft.x, canvas.height);
  
  // right of x=1
  ctx.fillRect(bottomRight.x, 0, canvas.width - bottomRight.x, canvas.height);
  
  // Restore normal drawing
  ctx.restore();
  
  // Draw grid and axes (
  drawGridLines();
  drawAxes();
  

  // Draw convex approx
  if(!drawing){
    drawConvexApproximation();
  }

  // Draw function f (blue)
  if(drawing){
    if (F.length > 0) {
      drawPoints(F, fColors.raw.color);
    }
    
    // Draw function g (orange)
    if (G.length > 0) {
      drawPoints(G, gColors.raw.color);
    }
  }
  

  // Draw mouse coordinates (always in screen space)
  drawMouseCoordinates();
}

function drawPoints(func, color){

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    // Start with first point
    const firstPoint = func[0];
    const firstScreen = normalizedToScreen(firstPoint.x, firstPoint.y);
    ctx.moveTo(firstScreen.x, firstScreen.y);
    
    // Draw lines to all subsequent points
    for (let i = 1; i < func.length; i++) {
      const point = func[i];
      const screen = normalizedToScreen(point.x, point.y);
      ctx.lineTo(screen.x, screen.y);
    }
    
    ctx.stroke();
    ctx.restore();
  
}

// **************************************************
// Event Listeners
// **************************************************

// TOUCH EVENTS
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });



functionSelect.addEventListener('change', (e) => {
  currentFunc = e.target.value;
  
});

/*

  Converts touch event to corresponding mouse event
  
  Input: 
  e - touch event
*/
function handleTouchStart(e) {
  if (!isHandToolActive) {
    // Handle drawing if hand tool is not active
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    startDraw(mouseEvent);
  } else {
    // Handle panning if hand tool is active
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    lastPanX = touch.clientX - rect.left;
    lastPanY = touch.clientY - rect.top;
    isPanning = true;
    e.preventDefault();
  }
}

function handleTouchMove(e) {
  if (!isHandToolActive || !isPanning) {
    // Handle drawing if hand tool is not active
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    draw(mouseEvent);
  } else {
    // Handle panning if hand tool is active
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;
    
    const dx = touchX - lastPanX;
    const dy = touchY - lastPanY;
    
    offsetX += dx;
    offsetY += dy;
    
    lastPanX = touchX;
    lastPanY = touchY;
    
    redrawCanvas();
    e.preventDefault();
  }
}

function handleTouchEnd(e) {
  if (!isHandToolActive && !isPanning) {
    // Handle drawing if hand tool is not active
    const mouseEvent = new MouseEvent('mouseup', {});
    endDraw(mouseEvent);
  } else {
    // Handle panning if hand tool is active
    isPanning = false;
    e.preventDefault();
  }
}

// MOUSE EVENTS
canvas.addEventListener('mouseleave', (e) => {
  if (drawing) {
    endDraw(e); // Finalize if user releases outside canvas
  } else {
    currentMousePos = null;
    redrawCanvas();
  }
});

canvas.addEventListener('mouseenter', (e) => {
  const pos = transformFromCanvas(e);
  currentMousePos = {
    x: pos.x,
    y: pos.y,
    rawX: pos.x * canvas.width,
    rawY: (1 - pos.y) * canvas.height
  };
  redrawCanvas();
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  // Convert to normalized coordinates
  const pos = screenToNormalized(mouseX, mouseY);
  
  currentMousePos = {
    x: pos.x,
    y: pos.y,
    rawX: mouseX,  // Store screen coordinates
    rawY: mouseY
  };
  
  if (drawing) {
    draw(e);
  }
  
  redrawCanvas();
});

canvas.addEventListener('mouseleave', () => {
  currentMousePos = null;
  redrawCanvas();
});


// Toolbar scrolling
toolbar.addEventListener('mousedown', (e) => {
  
  isDown = true;
  toolbar.style.cursor = 'grabbing';
  toolbar.style.userSelect = 'none';
  startX = e.pageX - toolbar.getBoundingClientRect().left;
  scrollLeft = toolbar.scrollLeft;
});
document.addEventListener('mouseup', () => {
  isDown = false;
  toolbar.style.cursor = '';
  toolbar.style.userSelect = '';
});
document.addEventListener('mouseleave', () => {
  isDown = false;
  toolbar.style.cursor = '';
  toolbar.style.userSelect = '';
});
toolbar.addEventListener('mousemove', (e) => {
  if (!isDown) return;
  e.preventDefault();
  const x = e.pageX - toolbar.getBoundingClientRect().left;
  const walk = (x - startX) * 2; 
  toolbar.scrollLeft = scrollLeft - walk;
});


// Table scrolling
tableScroll.addEventListener('mousedown', (e) => {
  tableIsDown = true;
  tableScroll.style.cursor = 'grabbing';
  tableScroll.style.userSelect = 'none';
  tableStartX = e.pageX - tableScroll.getBoundingClientRect().left;
  tableScrollLeft = tableScroll.scrollLeft;
});

document.addEventListener('mouseup', () => {
  tableIsDown = false;
  tableScroll.style.cursor = '';
  tableScroll.style.userSelect = '';
});

document.addEventListener('mouseleave', () => {
  tableIsDown = false;
  tableScroll.style.cursor = '';
  tableScroll.style.userSelect = '';
});

tableScroll.addEventListener('mousemove', (e) => {
  if (!tableIsDown) return;
  e.preventDefault();
  const x = e.pageX - tableScroll.getBoundingClientRect().left;
  const walk = (x - tableStartX) * 2;
  tableScroll.scrollLeft = tableScrollLeft - walk;
});


// Toolbar buttons
document.getElementById('handTool').addEventListener('click', toggleHandTool);
document.getElementById('zoomIn').addEventListener('click', () => zoomCanvas(1.2));
document.getElementById('zoomOut').addEventListener('click', () => zoomCanvas(0.8));
document.getElementById('resetView').addEventListener('click', resetView);
document.getElementById('clearBtn').addEventListener('click', () => {
  clearFuncVars('f')
  clearFuncVars('g')
  eqnLabel.textContent = '';
  tableBody.innerHTML = '';
  redrawCanvas();
  resetView();
});

// Panning handlers

canvas.addEventListener('mousedown', (e) => {
  if (isHandToolActive) {
    handlePanStart(e);
  } else {
    startDraw(e);
  }
});

canvas.addEventListener('mousemove', handlePanMove);

canvas.addEventListener('mouseup', (e) => {
  if (isPanning) {
    handlePanEnd();
  } else if (drawing) {
    endDraw(e);
  }
});
canvas.addEventListener('mouseleave', handlePanEnd);

// Window Resize
window.addEventListener('resize', () => {
  setCanvasSize();
});

// Orientation change listener
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    resizeCanvasToMatchDisplaySize();
  }, 100);
});

window.addEventListener('load', () => {
  createControlPanel();
  document.querySelectorAll('#graph-controls input').forEach(checkbox => {
    checkbox.addEventListener('change', redrawCanvas);
  });

  // Default to checked
  document.getElementById('show-f').checked = true;
  document.getElementById('show-g').checked = true;
  document.getElementById('show-convexF').checked = true;
  document.getElementById('show-convexG').checked = true;
});

// Initialize
setCanvasSize();
resetView();


