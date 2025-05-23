
const canvas = document.getElementById('drawCanvas');
const eqnLabel = document.getElementById('eqnLabel');
const ctx = canvas.getContext('2d');
const tableBody = document.getElementById('pointTableBody');

let currentMousePos = null;
let drawing = false;
let points = [];
let lastPoint = null;
let concaveCoefficients = null;



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
  Converts screen coordinates to normalized canvas coordinates {x,y}
  where  x, y ∈ [0,1] range and (0,0) is the bottom left corner

  Input: 
  e - Mouse/touch event

  Output: 
  Normalized coordinated of the form {x, y}
*/
function getPos(e) {
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
  
  // Convert to 0-1 range with (0,0) at bottom-left
  return {
    x: Math.max(0, Math.min(1, x / canvas.width)),
    y: Math.max(0, Math.min(1, 1 - (y / canvas.height)))
  };
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
  // Convert 0-1 coordinates to canvas pixels
  return {
    x: point.x * canvas.width,
    y: (1 - point.y) * canvas.height // Flip y to allow for bottom-left origin
  };
}

/*
  Draws 10x10 grid lines on the canvas.
*/ 
function drawGridLines() {
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'; // Very light gray
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
  
  // Slightly darker axes
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
}

/*
  Draws 0 at the orgin, and 1 and the ends of the graph
*/
function drawAxes() {
  ctx.fillStyle = '#000';
  ctx.font = '12px Arial';
  ctx.fillText('0', 5, canvas.height - 5);
  ctx.fillText('1', canvas.width - 10, canvas.height - 5);
  ctx.fillText('1', 5, 15);
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
  drawing = true;
  points = []; 
  concaveCoefficients = null; 
  const pos = getPos(e);
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
  const pos = getPos(e);
  
  // Update mouse position
  currentMousePos = {
    x: pos.x,
    y: pos.y,
    rawX: pos.x * canvas.width,
    rawY: (1 - pos.y) * canvas.height
  };

  if (!drawing) return;
  
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
  
  const peak = fitResult.fit[fitResult.peakIndex];
  const peakScreen = transformToCanvas({x: peak[0], y: peak[1]});
  
  //  Draw the increasing part in blue
  ctx.strokeStyle = 'rgba(0, 100, 255, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= fitResult.peakIndex; i++) {
      const point = fitResult.fit[i];
      const screen = transformToCanvas({x: point[0], y: point[1]});
      if (i === 0) ctx.moveTo(screen.x, screen.y);
      else ctx.lineTo(screen.x, screen.y);
  }
  ctx.stroke();
  
  // Draw the decreasing part in orange
  ctx.strokeStyle = 'rgba(255, 100, 0, 0.8)';
  ctx.beginPath();
  ctx.moveTo(peakScreen.x, peakScreen.y); // Start at peak
  for (let i = fitResult.peakIndex + 1; i < fitResult.fit.length; i++) {
      const point = fitResult.fit[i];
      const screen = transformToCanvas({x: point[0], y: point[1]});
      ctx.lineTo(screen.x, screen.y);
  }
  ctx.stroke();
  
  // Draw the decreasing part flipped in green
  ctx.strokeStyle = 'rgba(0, 200, 100, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(peakScreen.x, peakScreen.y); // Start at peak
  
  // Create flipped points
  for (let i = fitResult.peakIndex + 1; i < fitResult.fit.length; i++) {
      const point = fitResult.fit[i];
      // Flip vertically about the peak y-value
      const flippedY = 2 * peak[1] - point[1];
      const screen = transformToCanvas({x: point[0], y: flippedY});
      ctx.lineTo(screen.x, screen.y);
  }
  ctx.stroke();
  
  //  Mark the peak point in red
  ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
  ctx.beginPath();
  ctx.arc(peakScreen.x, peakScreen.y, 5, 0, 2 * Math.PI);
  ctx.fill();
  
  // Display the equation info
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

  ctx.fillStyle = drawing ? '#1e81b0' : '#000'; // Blue when drawing, black otherwise
  ctx.font = '12px Arial';
  
  // Determine quadrant and set offsets
  let offsetX, offsetY;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  if (currentMousePos.rawX < centerX) {
    // Left side - place label to the right
    offsetX = 10;
  } else {
    // Right side - place label to the left
    offsetX = -100;
  }
  
  if (currentMousePos.rawY < centerY) {
    // Top half - place label below
    offsetY = 20;
  } else {
    // Bottom half - place label above
    offsetY = -10;
  }
  
  if (drawing) {
    offsetX = currentMousePos.rawX < centerX ? 40 : -120;
    offsetY = currentMousePos.rawY < centerY ? 30 : -20;
  }
  
  // Ensure coordinates stay visible near edges
  const textX = Math.max(5, Math.min(
    currentMousePos.rawX + offsetX, 
    canvas.width - 100
  ));
  const textY = Math.max(15, Math.min(
    currentMousePos.rawY + offsetY, 
    canvas.height - 5
  ));
  
  // Draw background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillRect(
    textX - 2, 
    textY - 12, 
    100, 
    15
  );
  
  // Draw coordinates
  ctx.fillStyle = drawing ? '#1e81b0' : '#000';
  ctx.fillText(
    `(${currentMousePos.x.toFixed(2)}, ${currentMousePos.y.toFixed(2)})`,
    textX,
    textY
  );
}


/*
  
  Redraws the canvas, including
  - Grid, axes, points, current curve.
  - Mouse coordinates and concave fit (if applicable)

*/
function redrawCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  drawGridLines();
  drawAxes();

  if (drawing) {
    // Blue line during drawing
    if (points.length > 1) {
      ctx.strokeStyle = '#1e81b0'; // Blue
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      let first = transformToCanvas(points[0]);
      ctx.moveTo(first.x, first.y);
      
      for (let i = 1; i < points.length; i++) {
        let p = transformToCanvas(points[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  
  } else if (points.length > 1) {
      // Draw user's sketch
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      
      let first = transformToCanvas(points[0]);
      ctx.moveTo(first.x, first.y);
      
      for (let i = 1; i < points.length; i++) {
        let p = transformToCanvas(points[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
        // points
      ctx.fillStyle = '#000';
      points.forEach(p => {
        const screen = transformToCanvas(p);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });

      // Draw convcave fit if available
      if (concaveCoefficients) {
        if (concaveCoefficients.fit) {
          drawConcaveApproximation(concaveCoefficients);
        
        }
      }
    }

  drawMouseCoordinates();

}


// **************************************************
// EVENT LISTENERS
// **************************************************

// Touch events
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });


/*

  Converts touch event to corresponding mouse event
  
  Input: 
  e - touch event
*/
function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousedown', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  startDraw(mouseEvent);
}
function handleTouchMove(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent('mousemove', {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  draw(mouseEvent);
}
function handleTouchEnd(e) {
  e.preventDefault();
  const mouseEvent = new MouseEvent('mouseup', {});
  endDraw(mouseEvent);
}


// Mouse events
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
  const pos = getPos(e);
  currentMousePos = {
    x: pos.x,
    y: pos.y,
    rawX: pos.x * canvas.width,
    rawY: (1 - pos.y) * canvas.height
  };
  redrawCanvas();
});

canvas.addEventListener('mousemove', (e) => {
  const pos = getPos(e);
  currentMousePos = {
    x: pos.x,
    y: pos.y,
    rawX: pos.x * canvas.width,
    rawY: (1 - pos.y) * canvas.height
  };
  
  if (drawing) {
    draw(e); // Handle actual drawing
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



// Initialize
setCanvasSize();


