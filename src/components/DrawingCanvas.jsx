import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';

const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 360;

const COLORS = [
  { label: 'Schwarz', value: '#20242c' },
  { label: 'Rot', value: '#e5484d' },
  { label: 'Orange', value: '#f08c32' },
  { label: 'Gelb', value: '#e5b700' },
  { label: 'Grün', value: '#30a46c' },
  { label: 'Blau', value: '#2680eb' },
  { label: 'Violett', value: '#8e4ec6' },
  { label: 'Braun', value: '#8b5e3c' },
];

const DrawingCanvas = forwardRef(function DrawingCanvas({ onSubmit, disabled = false }, ref) {
  const canvasRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const activePointerIdRef = useRef(null);
  const strokesRef = useRef([]);
  const [strokes, setStrokes] = useState([]);
  const [brushRadius, setBrushRadius] = useState(3);
  const [brushColor, setBrushColor] = useState('#20242c');
  const [isEraser, setIsEraser] = useState(false);

  const redraw = useCallback((nextStrokes = strokesRef.current) => {
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    nextStrokes.forEach(stroke => {
      if (stroke.points.length === 0) return;
      context.save();
      context.globalCompositeOperation = stroke.isEraser ? 'destination-out' : 'source-over';
      context.strokeStyle = stroke.color;
      context.fillStyle = stroke.color;
      context.lineWidth = stroke.radius * 2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      stroke.points.slice(1).forEach(point => context.lineTo(point.x, point.y));
      if (stroke.points.length === 1) {
        context.arc(stroke.points[0].x, stroke.points[0].y, stroke.radius, 0, Math.PI * 2);
        context.fill();
      } else {
        context.stroke();
      }
      context.restore();
    });
  }, []);

  const setStoredStrokes = useCallback((nextStrokes) => {
    strokesRef.current = nextStrokes;
    setStrokes(nextStrokes);
    redraw(nextStrokes);
  }, [redraw]);

  const getImageData = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = CANVAS_WIDTH;
    exportCanvas.height = CANVAS_HEIGHT;
    const context = exportCanvas.getContext('2d');
    if (!context) return null;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.drawImage(canvas, 0, 0);
    return exportCanvas.toDataURL('image/png');
  }, []);

  useImperativeHandle(ref, () => ({ getImageData }), [getImageData]);

  const pointFromEvent = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * CANVAS_WIDTH / bounds.width,
      y: (event.clientY - bounds.top) * CANVAS_HEIGHT / bounds.height,
    };
  };

  const handlePointerDown = (event) => {
    if (disabled || activePointerIdRef.current !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    activeStrokeRef.current = {
      color: brushColor,
      radius: isEraser ? 18 : brushRadius,
      isEraser,
      points: [pointFromEvent(event)],
    };
    redraw([...strokesRef.current, activeStrokeRef.current]);
  };

  const handlePointerMove = (event) => {
    if (event.pointerId !== activePointerIdRef.current || !activeStrokeRef.current) return;
    activeStrokeRef.current.points.push(pointFromEvent(event));
    redraw([...strokesRef.current, activeStrokeRef.current]);
  };

  const handlePointerUp = (event) => {
    if (event.pointerId !== activePointerIdRef.current || !activeStrokeRef.current) return;
    const completedStroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    activePointerIdRef.current = null;
    setStoredStrokes([...strokesRef.current, completedStroke]);
  };

  const clearCanvas = () => setStoredStrokes([]);
  const undoCanvas = () => setStoredStrokes(strokesRef.current.slice(0, -1));

  const submitCanvas = () => {
    const imageData = getImageData();
    if (imageData) onSubmit(imageData);
  };

  return (
    <div className="drawing-tools">
      <div className="drawing-options">
        <fieldset className="color-picker">
          <legend>Stiftfarbe</legend>
          {COLORS.map(color => (
            <button
              aria-label={color.label}
              aria-pressed={!isEraser && brushColor === color.value}
              className={`color-swatch ${!isEraser && brushColor === color.value ? 'selected' : ''}`}
              disabled={disabled}
              key={color.value}
              onClick={() => {
                setBrushColor(color.value);
                setIsEraser(false);
              }}
              style={{ '--swatch-color': color.value }}
              type="button"
            />
          ))}
          <button
            aria-pressed={isEraser}
            className={`eraser-button ${isEraser ? 'selected' : ''}`}
            disabled={disabled}
            onClick={() => setIsEraser(true)}
            type="button"
          >
            Radierer
          </button>
        </fieldset>
        <label className="brush-size">
          Strichstärke <strong>{brushRadius}</strong>
          <input
            aria-label="Strichstärke"
            disabled={disabled}
            max="12"
            min="1"
            onChange={event => setBrushRadius(Number(event.target.value))}
            type="range"
            value={brushRadius}
          />
        </label>
      </div>
      <canvas
        aria-label="Zeichenfläche"
        className="drawing-canvas"
        height={CANVAS_HEIGHT}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={canvasRef}
        style={{ width: '100%', maxWidth: CANVAS_WIDTH, aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
        width={CANVAS_WIDTH}
      />
      <div className="canvas-actions">
        <button className="secondary-button" onClick={undoCanvas} disabled={disabled || strokes.length === 0} type="button">Rückgängig</button>
        <button className="secondary-button" onClick={clearCanvas} disabled={disabled || strokes.length === 0} type="button">Leeren</button>
        <button className="primary-button" onClick={submitCanvas} disabled={disabled} type="button">Zeichnung abgeben</button>
      </div>
    </div>
  );
});

export default DrawingCanvas;
