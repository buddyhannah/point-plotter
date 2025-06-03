const canvas = document.getElementById('drawCanvas');
const eqnLabel = document.getElementById('eqnLabel');
const ctx = canvas.getContext('2d');
const tableBody = document.getElementById('pointTableBody');

let currentMousePos = null;
let drawing = false;
let points = [];
let lastPoint = null;
let convexScaledPoints = []; // [ { x: x1, y: y1 }, { x: x2, y: y2 }, ... ];
let convexPeakIdx = -1
let convexPoints = null;

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

// for toolbar scrolling
const toolbar = document.querySelector('.toolbar');
let isDown = false;
let startX = 0;
let scrollLeft = 0;


// For setting range of the x- and y- values
const X_SCALE_FACTOR = 2; 
const Y_SCALE_FACTOR = 2; 
const INITIAL_ZOOM = 2;  
const FINAL_ZOOM = 1;   

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
    canvas.width = displayWidth;
    canvas.height = displayHeight;
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
    x: (normX * canvas.width) + offsetX,
    y: ((1 - normY/Y_SCALE_FACTOR) * canvas.height * scale) + offsetY
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
    x: (screenX - offsetX) / canvas.width, 
    y: (1 - ((screenY - offsetY) / (canvas.height * scale))) * Y_SCALE_FACTOR
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
  ctx.scale(1, scale);

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
  const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale * zoomFactor));
  
  // Adjust offsets to zoom toward center
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  offsetX = centerX - (centerX - offsetX) * (newScale / scale);
  offsetY = centerY - (centerY - offsetY) * (newScale / scale);
  
  scale = newScale;
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
  const scaleStep = (targetScale - scale) / zoomSteps;
  const offsetYStep = (targetOffsetY - offsetY) / zoomSteps;
  
  const animateZoom = () => {
    // Only modify y-related values
    scale += scaleStep;
    offsetY += offsetYStep;
    
    redrawCanvas();
    
    if (Math.abs(scale - targetScale) > 0.01) {
      requestAnimationFrame(animateZoom);
    } else {
      // Final adjustment
      scale = targetScale;
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
  scale = INITIAL_ZOOM;
  offsetX = 0;
  offsetY = canvas.height * (1 - scale);
  redrawCanvas();
}


// **************************************************
// Handle Drawing
// **************************************************


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
    points = []; 
    convexPoints = null; 
    points.push(pos);
    redrawCanvas();
    
  }
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

  if (!drawing || isHandToolActive || !isPointInBounds(pos.x, pos.y)) { 
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


/*
  Draws the convex approximation with:
  - The original increasing and decreasing segments
  - The decreasing segment flipped vertically
*/
function drawConvexApproximation(fitResult) {
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
  
  // Mark the peak point in red
  ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
  ctx.beginPath();
  ctx.arc(peakScreen.x, peakScreen.y, 5, 0, 2 * Math.PI);
  ctx.fill();
  

  //  Draw the scaled graph in pink
  ctx.strokeStyle = 'rgba(255, 203, 17, 0.8)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < convexScaledPoints.length; i++) {
  const { x, y } = convexScaledPoints[i];
    const screen = normalizedToScreen(x, y);
    if (i === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  }
  ctx.stroke();

 
  // Draw the flipped increasing part of the scaled graph in green
  // to create decreasing graph
  const flippedIncreasing = flipIncreasingPart();
  ctx.strokeStyle = 'rgba(255, 100, 0, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  flippedIncreasing.forEach((point, i) => {
    const screen = normalizedToScreen(point.x, point.y);
    if (i === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  ctx.stroke();

  // Draw 'unflipped' increasing
  const flippedVert = flipVertically(flippedIncreasing)
  ctx.strokeStyle = 'rgba(0, 100, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  flippedVert.forEach((point, i) => {
    const screen = normalizedToScreen(point.x, point.y);
    if (i === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  ctx.stroke();
  
  // Draw the peak scaled
  const scaledPeakScreen = normalizedToScreen(peak[0], 1);
  ctx.fillStyle = 'rgba(163, 57, 255, 1)';
  ctx.beginPath();
  ctx.arc(scaledPeakScreen.x, scaledPeakScreen.y, 5, 0, 2 * Math.PI);
  ctx.fill();

  ctx.restore();


  // Update equation label
  const equationText = `Convex Fit | 
  Peak: (${peak[0].toFixed(3)}, ${peak[1].toFixed(3)}) |
  Scaled Peak: (${convexScaledPoints[fitResult.peakIndex].x.toFixed(3)}, ${convexScaledPoints[fitResult.peakIndex].y.toFixed(3)}) |
  Error: ${fitResult.error.toFixed(4)}`;
  eqnLabel.textContent = equationText;
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
 * 
 * @param {*} xValues 
 * @param {*} yValues 
 * @returns 
 */
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
function solveConvexRegression(xValues, yValues) {
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

  // Find scaled convex fit
  convexPeakIdx = bestPeakIndex
  convexScaledPoints = scalePeakOne(bestFit, bestPeakIndex).map(([x, y]) => ({ x, y }));

  return {
    fit: bestFit,
    peakIndex: bestPeakIndex,
    error: bestError
  };
}

/* Scales the points so the peak value is 1 */
function scalePeakOne(bestFit, peakIndex) {
  const maxY = bestFit[peakIndex][1]; // Get y-value at peak index
  if (maxY === 0) return bestFit;     // Avoid division by zero
  return bestFit.map(([x, y]) => [x, y / maxY]);
}

/**
 * Flips the increasing part of convex scaled points vertically around the peak
 * while keeping the decreasing part unchanged
 * @param {Array} convexScaledPoints - Array of {x, y} points (peak scaled to 1)
 * @param {number} peakIndex - Index of the peak point
 * @returns {Array} Array of {x, y} points with increasing part flipped
 */
function flipIncreasingPart() {
  const peakY = convexScaledPoints[convexPeakIdx].y;
  return convexScaledPoints.map((point, i) => {
    let myPoint = {...point}

    if (i <= convexPeakIdx) {
      // Flip increasing part around peak (y = 1)
      myPoint.y = 2 * peakY - myPoint.y;
    
    }
    // Keep decreasing part as is
    return myPoint
  });
}

/**
 * Flips the entire graph vertically by calculating 2 - x for each point
 * @param {Array} points - Array of {x, y} points
 * @returns {Array} Horizontally flipped array of {x, y} points
 */
function flipVertically(points) {
  return points.map(point => ({
    x: point.x,
    y: 2 - point.y
  }));
}


/*
  Helper method for solveonvexRegression to
  calculate the squared error between the predicted and actual y-value
*/
function calculateError(actual, predicted) {
  return actual.reduce((sum, y, i) => sum + Math.pow(y - predicted[i], 2), 0);
}

// **************************************************
//  Data Processing and UI
// **************************************************


/*
  
  Processes the drawn points by:
  - Sorting them by ascending x-value
  - Generating a set of points at x-intervals of 0.01 (from 0 to 1) using linear interpolation if needed
  - Calling solveConvexRegression to compute a convex regression fit from the processed data.
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
    const result = solveConvexRegression(xValues, yValues);
    
    if (!result) {
        eqnLabel.textContent = 'Could not compute regression.';
        return;
    }
    
    convexPoints = result;

    updateTable(); 
    redrawCanvas();
  } catch (error) {
      eqnLabel.textContent = "Error in computation";
      console.error(error);
  }

  zoomY(FINAL_ZOOM)
}
    

/*
  Populates the HTML table with point coordinates.
*/
function updateTable() {
  tableBody.innerHTML = '';
  
  points.forEach((point, i) => {
    const row = document.createElement('tr');
    const xCell = document.createElement('td');
    const yCell = document.createElement('td');
    const yConvexCell = document.createElement('td');
    
    xCell.textContent = point.x.toFixed(2);
    yCell.textContent = point.y.toFixed(2);

    const scaledY = convexScaledPoints?.[i]?.y;
    yConvexCell.textContent = scaledY !== undefined ? scaledY.toFixed(2) : '';

    row.appendChild(xCell);
    row.appendChild(yCell);
    row.appendChild(yConvexCell);
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
  ctx.fillStyle = 'rgba(255, 255, 255, 0)';
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
  
  // Draw grid and axes (in transformed space)
  drawGridLines();
  drawAxes();
  
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

    // Draw convex fit if available
    if (convexPoints?.fit) {
      drawConvexApproximation(convexPoints);
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


// Initialize
setCanvasSize();
resetView();


