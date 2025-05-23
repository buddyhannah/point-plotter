
const canvas = document.getElementById('drawCanvas');
const eqnLabel = document.getElementById('eqnLabel');
const ctx = canvas.getContext('2d');
const tableBody = document.getElementById('pointTableBody');

let currentMousePos = null;
let drawing = false;
let points = [];
let lastPoint = null;
let concaveCoefficients = null;

// for zooming/panning
let isHandToolActive = false;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let isPanning = false;
let lastPanX = 0;
let lastPanY = 0;
const MAX_ZOOM = 5;
const MIN_ZOOM = 0.5;

// **************************************************
// Canvas Setup
// **************************************************

/*
  Sets the canvas size
*/
function setCanvasSize() {
  canvas.style.width = '80vw';
  canvas.style.height = '70vh';
  canvas.style.maxWidth = 'none';
  canvas.style.maxHeight = 'none';
  resizeCanvasToMatchDisplaySize();
}

/*
  Matches canvas pixel dimensions to its display size
*/
function resizeCanvasToMatchDisplaySize() {
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    redrawCanvas();
  }
}


/*
  Convert normalized coordinates (0-1 range) to screen pixel coordinates
*/
function normalizedToScreen(normX, normY) {
  return {
    x: (normX * canvas.width * scale) + offsetX,
    y: ((1 - normY) * canvas.height * scale) + offsetY
  };
}

/*
  Convert screen pixel coordinates to normalized coordinates (0-1 range)
*/
function screenToNormalized(screenX, screenY) {
  return {
    x: (screenX - offsetX) / (canvas.width * scale),
    y: 1 - ((screenY - offsetY) / (canvas.height * scale))
  };
}


/*
  Convert normalized coordinates to untransformed canvas coordinates
  (for drawing operations that need to be transformed)
*/
function normalizedToScreen(normX, normY) {
  return {
    x: (normX * canvas.width * scale) + offsetX,
    y: ((1 - normY) * canvas.height * scale) + offsetY
  };
}


/*
  Converts screen coordinates to normalized canvas coordinates {x,y}
  where  x, y ∈ [0,1] range and (0,0) is the bottom left corner

  Input: 
  e - Mouse/touch event

  Output: 
  Normalized coordinated of the form {x, y}
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


/*
  Returns the actual canvas pixel coordinate corresponding 
  to the normalized coordinate

  Input:
  {x,y} - Normalized coordinate 
  
  Output:
  {x, y} - Pixel coordinate
*/
function transformToCanvas(point) {
  return normalizedToScreen(point.x, point.y);
}



/*
  Draws 10x10 grid lines on the canvas.
*/ 
function drawGridLines() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

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
  for (let y = 0; y <= 1; y += 0.1) {
    const pixelY = (1 - y) * canvas.height;
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


/*
  Draws 0 at the orgin, and 1 and the ends of the graph
*/
function drawAxes() {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  const zeroPos = normalizedToScreen(0, 0);
  const oneXPos = normalizedToScreen(1, 0);
  const oneYPos = normalizedToScreen(0, 1);
  
  ctx.fillStyle = '#000';
  ctx.font = '12px Arial';
  ctx.fillText('0', zeroPos.x + 5, zeroPos.y - 5);
  ctx.fillText('1', oneXPos.x - 15, oneXPos.y - 5);
  ctx.fillText('1', oneYPos.x + 5, oneYPos.y + 15);
  
  ctx.restore();
}



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

function zoomCanvas(zoomFactor) {
  // Calculate new scale with constraints
  const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale * zoomFactor));
  
  // Adjust offsets to zoom toward center
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  offsetX = centerX - (centerX - offsetX) * (newScale / scale);
  offsetY = centerY - (centerY - offsetY) * (newScale / scale);
  
  scale = newScale;
  redrawCanvas();
}


function resetView() {
  scale = 1;
  offsetX = 0;
  offsetY = 0;
  redrawCanvas();
}

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

function handlePanEnd() {
  if (!isHandToolActive) return;
  
  isPanning = false;
  canvas.style.cursor = 'grab';
}


// **************************************************
// Handle Drawing
// **************************************************


/*
  Starts a new drawing, clears points, and stores initial position.

  Input: Mouse 
  e - Mouse event

  Output: None
*/
function startDraw(e) {
  if (isHandToolActive) return; // Don't draw when hand tool is active

  drawing = true;
  points = []; 
  concaveCoefficients = null; 
  const pos = transformFromCanvas(e);
  points.push(pos);
  redrawCanvas();
  
  e.preventDefault();
}

/* 
  Adds current mouse position to points array during drawing
  
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

   if (!drawing || isHandToolActive) { 
      redrawCanvas();
      return;
    }
    
  
  points.push(pos);
  lastPoint = pos;
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
  finalizeGraph(); // Process points and generate table
  e.preventDefault();
}



// **************************************************
// Computing Best Concave Fit
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


/*
  Given x- and y-values, returns the best piecewise isotonic regression 
  that is increasing to a peak, then decreasing. 

  Input:
  xVals - array of x-values (in increasing order)
  yVals - array of y-values
  
  Output:
  - fit: array of [x, fittedY]
  - peakIndex: index of the peak
  - error: total squared error of the best fit

  Time complexity: O(n^2)
*/
function solveConcaveRegression(xValues, yValues) {
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
    const leftError = calculateError(leftFitY, leftY);
    const rightError = calculateError(rightFitY, rightY);
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

/*
  Helper method for solveConcaveRegression to
  calculate the squared error between the predicted and actual y-value
*/
function calculateError(actual, predicted) {
  return actual.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0);
}


/*
  Draws the concave approximation with:
  - The original increasing and decreasing segments
  - The decreasing segment flipped vertically
*/
function drawConcaveApproximation(fitResult) {
  if (!fitResult?.fit) return;
  
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  const peak = fitResult.fit[fitResult.peakIndex];
  const peakScreen = normalizedToScreen(peak[0], peak[1]);
  
  // Draw the increasing part in blue
  ctx.strokeStyle = 'rgba(0, 100, 255, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  for (let i = 0; i <= fitResult.peakIndex; i++) {
    const point = fitResult.fit[i];
    const screen = normalizedToScreen(point[0], point[1]);
    if (i === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  }
  ctx.stroke();
  
  // Draw the decreasing part in orange
  ctx.strokeStyle = 'rgba(255, 100, 0, 0.8)';
  ctx.beginPath();
  ctx.moveTo(peakScreen.x, peakScreen.y);
  
  for (let i = fitResult.peakIndex + 1; i < fitResult.fit.length; i++) {
    const point = fitResult.fit[i];
    const screen = normalizedToScreen(point[0], point[1]);
    ctx.lineTo(screen.x, screen.y);
  }
  ctx.stroke();
  
  // Draw the decreasing part flipped in green
  ctx.strokeStyle = 'rgba(0, 200, 100, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(peakScreen.x, peakScreen.y);
  
  for (let i = fitResult.peakIndex + 1; i < fitResult.fit.length; i++) {
    const point = fitResult.fit[i];
    const flippedY = 2 * peak[1] - point[1];
    const screen = normalizedToScreen(point[0], flippedY);
    ctx.lineTo(screen.x, screen.y);
  }
  ctx.stroke();
  
  // Mark the peak point in red
  ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
  ctx.beginPath();
  ctx.arc(peakScreen.x, peakScreen.y, 5, 0, 2 * Math.PI);
  ctx.fill();
  
  ctx.restore();
  
  // Update equation label
  const equationText = `Concave Fit | 
    Peak: (${peak[0].toFixed(3)}, ${peak[1].toFixed(3)}) |
    Error: ${fitResult.error.toFixed(4)}`;
  eqnLabel.textContent = equationText;
}

// **************************************************
//  Data Processing and UI
// **************************************************


/*
  
  Processes the drawn points by:
  - Sorting them by ascending x-value
  - Generating a set of points at x-intervals of 0.01 (from 0 to 1) using linear interpolation if needed
  - Calling solveConcaveRegression to compute a concave regression fit from the processed data.
  - Calling  updateTable and redrawCanvas to update he table and canvas with the results

*/
function finalizeGraph() {
  if (points.length < 3) {
    eqnLabel.textContent = "Need at least 3 points";
    return;
  }

  // Sort points by ascending x-value
  points = [...points].sort((a, b) => a.x - b.x);
 
  const processedPoints = [];
  const xStep = 0.01;
  let currentX = 0;
  let pointIndex = 0;
  
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
    
    processedPoints.push({
      x: currentX,
      y: yValue
    });
    
    currentX += xStep;
  }

  // Update points
  points = processedPoints

  const xValues = processedPoints.map(p => p.x);
  const yValues = processedPoints.map(p => p.y);
  
  try {
    eqnLabel.textContent = "Computing...";
    const result = solveConcaveRegression(xValues, yValues);
    
    if (!result) {
        eqnLabel.textContent = 'Could not compute regression.';
        return;
    }
    
    concaveCoefficients = result;

    updateTable(); 
    redrawCanvas();
  } catch (error) {
      eqnLabel.textContent = "Error in computation";
      console.error(error);
  }
}
    

/*
  Populates the HTML table with point coordinates.
*/
function updateTable() {
  tableBody.innerHTML = '';
  
  points.forEach(point => {
    const row = document.createElement('tr');
    const xCell = document.createElement('td');
    const yCell = document.createElement('td');
    
    xCell.textContent = point.x.toFixed(2);
    yCell.textContent = point.y.toFixed(2);
    
    row.appendChild(xCell);
    row.appendChild(yCell);
    tableBody.appendChild(row);
  });
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillRect(labelX - 2, labelY - 12, 100, 15);
  
  // Draw coordinates
  ctx.fillStyle = drawing ? '#1e81b0' : '#000';
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
  - Mouse coordinates and concave fit (if applicable)

*/
function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw grid and axes (in transformed space)
  drawGridLines();
  drawAxes();

  // Save the untransformed state for drawing elements that shouldn't be transformed
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  
  if (drawing) {
    // Draw the current line being drawn
    if (points.length > 1) {
      ctx.strokeStyle = '#1e81b0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      let first = normalizedToScreen(points[0].x, points[0].y);
      ctx.moveTo(first.x, first.y);
      
      for (let i = 1; i < points.length; i++) {
        let p = normalizedToScreen(points[i].x, points[i].y);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  } else if (points.length > 1) {
    // Draw the final curve
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    let first = normalizedToScreen(points[0].x, points[0].y);
    ctx.moveTo(first.x, first.y);
    
    for (let i = 1; i < points.length; i++) {
      let p = normalizedToScreen(points[i].x, points[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = '#000';
    points.forEach(p => {
      const screen = normalizedToScreen(p.x, p.y);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Draw concave fit if available
    if (concaveCoefficients?.fit) {
      drawConcaveApproximation(concaveCoefficients);
    }
  }

  // Restore the untransformed state
  ctx.restore();
  
  // Draw mouse coordinates (always in screen space)
  drawMouseCoordinates();
}


// **************************************************
// Event Listeners
// **************************************************

// TOUCH EVENTS
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });


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
  if (!isHandToolActive) {
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
canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mouseup', endDraw);
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

// Window Resize
window.addEventListener('resize', () => {
  setCanvasSize();
});


// Toolbar buttons
document.getElementById('handTool').addEventListener('click', toggleHandTool);
document.getElementById('zoomIn').addEventListener('click', () => zoomCanvas(1.2));
document.getElementById('zoomOut').addEventListener('click', () => zoomCanvas(0.8));
document.getElementById('resetView').addEventListener('click', resetView);
document.getElementById('clearBtn').addEventListener('click', () => {
  points = [];
  tableBody.innerHTML = '';
  lastPoint = null;
  redrawCanvas();
});

// Panning handlers
canvas.addEventListener('mousedown', handlePanStart);
canvas.addEventListener('mousemove', handlePanMove);
canvas.addEventListener('mouseup', handlePanEnd);
canvas.addEventListener('mouseleave', handlePanEnd);

// Initialize
setCanvasSize();


