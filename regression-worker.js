importScripts('https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.5.0/math.min.js');

onmessage = function (e) {
  const { xValues, yValues } = e.data;

  const degree = 2;
  const A = xValues.map(x => [1, x, x * x]);

  try {
    const X = math.transpose(A);
    const XtX = math.multiply(X, A);
    const Xty = math.multiply(X, yValues);
    let coefficients = math.multiply(math.inv(XtX), Xty);

    if (coefficients[2] > 0) {
      coefficients[2] = -0.001;
    }

    postMessage({ coefficients });
  } catch (error) {
    postMessage({ error: error.message });
  }
};
