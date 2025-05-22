const canvas = document.getElementById('drawCanvas');
const eqnLabel = document.getElementById('eqnLabel');
const ctx = canvas.getContext('2d');
const tableBody = document.getElementById('pointTableBody');

let currentMousePos = null;
let drawing = false;
let points = [];
let lastPoint = null;
let concaveCoefficients = null;

// Set canvas size 
function setCanvasSize() {
  canvas.style.width = '80vw';
  canvas.style.height = '70vh';
  canvas.style.maxWidth = 'none';
  canvas.style.maxHeight = 'none';
  resizeCanvasToMatchDisplaySize();
}

function resizeCanvasToMatchDisplaySize() {
  const displayWidth = canvas.clientWidth;
  const displayHeight = canvas.clientHeight;
  
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    redrawCanvas();
  }
}

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

function transformToCanvas(point) {
  // Convert 0-1 coordinates to canvas pixels
  return {
    x: point.x * canvas.width,
    y: (1 - point.y) * canvas.height // Flip y for canvas drawing
  };
}


// Touch handler functions
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


function startDraw(e) {
  drawing = true;
  points = []; 
  concaveCoefficients = null; 
  const pos = getPos(e);
  points.push(pos);
  lastPoint = pos;
  redrawCanvas();
  e.preventDefault();
}
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

async function endDraw(e) {
  drawing = false;
  await finalizeGraph(); // Process points and generate table
  e.preventDefault();
}


// Calculate vertex of concave equation
function findQuadraticVertex(coefficients) {
  if (!coefficients || coefficients.length < 3) {
    console.error("Invalid coefficients array");
    return { x: 0, y: 0 }; // Default value
  }

  const [a, b, c] = coefficients;
  const xVertex = -b / (2 * c);
  const yVertex = a + b * xVertex + c * xVertex * xVertex;
  return { x: xVertex, y: yVertex };
}

// Create flipped version of the curve from vertex onward
function createFlippedCurve(coefficients, vertex) {
  const flippedPoints = [];
  const [a, b, c] = coefficients;
  
  for (let x = vertex.x; x <= 1.001; x += 0.01) {
    const originalY = a + b * x + c * x * x;
    // Flip vertically about the y-value of vertex
    const flippedY = 2 * vertex.y - originalY;
    flippedPoints.push({ x, y: flippedY });
  }
  
  return flippedPoints;
}

function createVandermonde(xValues, degree) {
  return xValues.map(x => {
    const row = [];
    for (let i = 0; i <= degree; i++) {
      row.push(Math.pow(x, i));
    }
    return row;
  });
}


// Timeout if computation takes too long
function withTimeout(promise, timeoutMs, timeoutMessage = 'Computation timed out') {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]);
}

// Find concave regression 
function solveConcaveRegression(xValues, yValues) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./regressionWorker.js');

    const timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error('Computation timed out'));
    }, 1000);

    worker.onmessage = (e) => {
      clearTimeout(timeoutId);
      if (e.data.error) {
        reject(new Error(e.data.error));
      } else {
        resolve(e.data.coefficients);
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeoutId);
      reject(err);
    };

    worker.postMessage({ xValues, yValues });
  });
}


// Draws the concave approximation
function drawConcaveApproximation(coefficients) {
  if (!coefficients) return; // Exit if no coefficients

  ctx.strokeStyle = 'rgba(0, 100, 255, 0.8)'; // Semi-transparent blue
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  for (let x = 0; x <= 1.0001; x += 0.01) {
    const y = coefficients[0] + coefficients[1]*x + coefficients[2]*x*x;
    const screen = transformToCanvas({x, y});
    if (x === 0) {
      ctx.moveTo(screen.x, screen.y);
    } else {
      ctx.lineTo(screen.x, screen.y);
    }
  }
  
  ctx.stroke();
  

   // Find vertex and create flipped curve
   const vertex = findQuadraticVertex(coefficients);
   const flippedPoints = createFlippedCurve(coefficients, vertex);
 
   // Draw flipped portion
   ctx.strokeStyle = 'rgba(255, 100, 0, 0.8)'; // Orange
   ctx.beginPath();
   
   // Start at vertex
   const vertexScreen = transformToCanvas(vertex);
   ctx.moveTo(vertexScreen.x, vertexScreen.y);
   
   // Draw flipped points
   flippedPoints.forEach(point => {
     const screen = transformToCanvas(point);
     ctx.lineTo(screen.x, screen.y);
   });
   ctx.stroke();

  // Show equation
  const equationText = `Concave approximation: y = ${coefficients[0].toFixed(3)} + ${coefficients[1].toFixed(3)}x + ${coefficients[2].toFixed(3)}x²`;
  eqnLabel.textContent = equationText;
}


async function finalizeGraph() {
  if (points.length < 3) {
    eqnLabel.textContent = "Not enough points to compute concave fit";
    concaveCoefficients = null;
    redrawCanvas();
    return;
  }
  
  // Sort points by x-value
  points = [...points].sort((a, b) => a.x - b.x);
  const xValues = points.map(p => p.x);
  const yValues = points.map(p => p.y);
  /*
  const processedPoints = [];
  const xStep = 0.01;
  let currentX = 0;
  let pointIndex = 0;
  
  // Map drawn points to the 0-1 x-range
  while (currentX <= 1.0001 && pointIndex < points.length) {
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
  
  points = processedPoints;
  updateTable();
  */
  try {
    // Add await here to get the actual coefficients
    concaveCoefficients = await solveConcaveRegression(xValues, yValues);
  } catch (error) {
    console.error("Finalization error:", error);
    eqnLabel.textContent = "Computation failed unexpectedly";
    concaveCoefficients = null;
  }
  
  redrawCanvas(); 
  
}

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

function drawAxes() {
  ctx.fillStyle = '#000';
  ctx.font = '12px Arial';
  ctx.fillText('0', 5, canvas.height - 5);
  ctx.fillText('1', canvas.width - 10, canvas.height - 5);
  ctx.fillText('1', 5, 15);
}

function drawMouseCoordinates() {
  if (!currentMousePos) return;

  ctx.fillStyle = drawing ? '#1e81b0' : '#000'; // Blue when drawing, black otherwise
  ctx.font = '12px Arial';
  
  // Determine quadrant and set appropriate offsets
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
  } else {

    // Draw final black graph
    if (points.length > 1) {
      // Draw connecting line
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

      // Draw points
      ctx.fillStyle = '#000';
      points.forEach(p => {
        const screen = transformToCanvas(p);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  
  }

  drawMouseCoordinates();

  if (concaveCoefficients) {
    drawConcaveApproximation(concaveCoefficients);
  }
}


// Initialize
setCanvasSize();

// Touch event listeners
canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

// Mouse event listeners
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


window.addEventListener('resize', () => {
  setCanvasSize();
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