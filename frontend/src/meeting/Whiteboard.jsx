import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Popconfirm, Space, Tooltip } from 'antd';
import { ClearOutlined, DownloadOutlined, HighlightOutlined } from '@ant-design/icons';

const COLORS = ['#1d2b53', '#ef4444', '#f59e0b', '#16a34a', '#2563eb', '#9333ea'];
const SIZES = [2, 5, 10];
const REF_WIDTH = 1000; // line widths are relative to a 1000px-wide board

function drawSegment(ctx, seg, w, h) {
  ctx.save();
  ctx.globalCompositeOperation = seg.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = seg.color;
  ctx.lineWidth = (seg.erase ? seg.width * 4 : seg.width) * (w / REF_WIDTH);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(seg.from[0] * w, seg.from[1] * h);
  ctx.lineTo(seg.to[0] * w, seg.to[1] * h);
  ctx.stroke();
  ctx.restore();
}

/**
 * Shared whiteboard synced over the meeting socket (`wb:segment`, `wb:clear`).
 * `store` is the meeting's stroke list (a ref kept by useMeeting, so strokes survive closing this panel);
 * incoming strokes are added to it by useMeeting, this component only draws them.
 */
export default function Whiteboard({ socketRef, store }) {
  const canvasRef = useRef(null);
  const lastRef = useRef(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [erase, setErase] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    store.current.forEach((s) => drawSegment(ctx, s, canvas.width, canvas.height));
  }, [store]);

  // Keep the canvas bitmap matched to its on-screen size (sharp on high-DPI screens).
  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      redraw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;
    const onSegment = (seg) => {
      const c = canvasRef.current;
      if (c) drawSegment(c.getContext('2d'), seg, c.width, c.height);
    };
    const onClear = () => redraw(); // useMeeting has already emptied the store
    socket.on('wb:segment', onSegment);
    socket.on('wb:clear', onClear);
    return () => {
      socket.off('wb:segment', onSegment);
      socket.off('wb:clear', onClear);
    };
  }, [socketRef, redraw]);

  const point = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return [Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1), Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)];
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lastRef.current = point(e);
  };

  const onMove = (e) => {
    if (!lastRef.current) return;
    const p = point(e);
    const seg = { from: lastRef.current, to: p, color, width: size, erase };
    lastRef.current = p;
    store.current.push(seg); // the server does not echo our own strokes back
    const c = canvasRef.current;
    drawSegment(c.getContext('2d'), seg, c.width, c.height);
    socketRef.current?.emit('wb:segment', seg);
  };

  const onUp = () => {
    lastRef.current = null;
  };

  const download = () => {
    const src = canvasRef.current;
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    const a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = `whiteboard-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    a.click();
  };

  return (
    <div className="wb">
      <div className="wb-toolbar">
        <Space size={4}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              className={`wb-color ${!erase && color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => {
                setColor(c);
                setErase(false);
              }}
            />
          ))}
        </Space>
        <Space size={4}>
          {SIZES.map((s) => (
            <button key={s} type="button" aria-label={`Size ${s}`} className={`wb-size ${size === s ? 'active' : ''}`} onClick={() => setSize(s)}>
              <i style={{ width: s + 2, height: s + 2 }} />
            </button>
          ))}
        </Space>
        <Space size={4}>
          <Tooltip title="Eraser">
            <Button size="small" type={erase ? 'primary' : 'default'} icon={<HighlightOutlined />} onClick={() => setErase((v) => !v)} />
          </Tooltip>
          <Popconfirm title="Clear the whiteboard for everyone?" onConfirm={() => socketRef.current?.emit('wb:clear')}>
            <Tooltip title="Clear">
              <Button size="small" icon={<ClearOutlined />} />
            </Tooltip>
          </Popconfirm>
          <Tooltip title="Download PNG">
            <Button size="small" icon={<DownloadOutlined />} onClick={download} />
          </Tooltip>
        </Space>
      </div>
      <div className="wb-stage">
        <canvas
          ref={canvasRef}
          className={`wb-canvas ${erase ? 'erasing' : ''}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      </div>
    </div>
  );
}
