import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands'
import { Camera } from '@mediapipe/camera_utils'

export default function WebcamTracker({ onHandPoseUpdate, isEnabled, onToggle }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraRef = useRef(null)
  const handsRef = useRef(null)

  const [cameraActive, setCameraActive] = useState(false)
  const [handDetected, setHandDetected] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [pinchDistance, setPinchDistance] = useState(1.0)
  const [isGrasping, setIsGrasping] = useState(false)
  const [fps, setFps] = useState(0)

  // حساب المسافة الإقليدية بين نقطتين
  const getDistance = (p1, p2) => {
    const dx = p1.x - p2.x
    const dy = p1.y - p2.y
    const dz = (p1.z || 0) - (p2.z || 0)
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  // معالجة نتائج تتبع نقاط اليد من MediaPipe
  const onResults = useCallback((results) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0]
      setHandDetected(true)

      // رسم الهيكل العظمي لليد (Hand Skeleton)
      ctx.lineWidth = 3
      ctx.strokeStyle = '#00ff88'
      for (const conn of HAND_CONNECTIONS) {
        const from = landmarks[conn[0]]
        const to = landmarks[conn[1]]
        ctx.beginPath()
        ctx.moveTo(from.x * canvas.width, from.y * canvas.height)
        ctx.lineTo(to.x * canvas.width, to.y * canvas.height)
        ctx.stroke()
      }

      // رسم نقاط المفاصل (21 Keypoints)
      landmarks.forEach((pt, index) => {
        ctx.beginPath()
        ctx.arc(pt.x * canvas.width, pt.y * canvas.height, index === 4 || index === 8 ? 6 : 4, 0, 2 * Math.PI)
        ctx.fillStyle = index === 4 || index === 8 ? '#ffaa00' : '#00e5ff'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
      })

      // قياس المسافة بين الإبهام (نقطة 4) والسبابة (نقطة 8) لكشف الإمساك (Pinch / Grasp)
      const thumbTip = landmarks[4]
      const indexTip = landmarks[8]
      const wrist = landmarks[0]
      const middleMcp = landmarks[9]

      // المسافة المقاسة ومقارنتها بمقياس كف اليد
      const handScale = getDistance(wrist, middleMcp) || 0.3
      const rawDist = getDistance(thumbTip, indexTip)
      const normalizedPinch = Math.min(1.0, rawDist / (handScale * 0.9))
      const grasping = normalizedPinch < 0.35

      setPinchDistance(normalizedPinch)
      setIsGrasping(grasping)

      // خط يوضح حالة القابض بين الإبهام والسبابة
      ctx.beginPath()
      ctx.moveTo(thumbTip.x * canvas.width, thumbTip.y * canvas.height)
      ctx.lineTo(indexTip.x * canvas.width, indexTip.y * canvas.height)
      ctx.strokeStyle = grasping ? '#ff4d4f' : '#ffaa00'
      ctx.lineWidth = grasping ? 4 : 2
      ctx.stroke()

      // إرسال الوضعية الحية لمجسم الروبوت 3D
      // نقوم بعكس محور X ليكون كالمرآة (Mirror mode)
      if (onHandPoseUpdate) {
        onHandPoseUpdate({
          isDetected: true,
          x: 1.0 - middleMcp.x, // مرآة لسهولة التحكم
          y: middleMcp.y,
          z: middleMcp.z || 0,
          pinch: normalizedPinch,
          isGrasping: grasping,
        })
      }
    } else {
      setHandDetected(false)
      if (onHandPoseUpdate) {
        onHandPoseUpdate({ isDetected: false })
      }
    }
    ctx.restore()
  }, [onHandPoseUpdate])

  // تشغيل / إيقاف الكاميرا
  useEffect(() => {
    if (!isEnabled) {
      if (cameraRef.current) {
        cameraRef.current.stop()
        cameraRef.current = null
      }
      setCameraActive(false)
      setHandDetected(false)
      return
    }

    let isMounted = true

    const initMediaPipe = async () => {
      try {
        setCameraError(null)

        const hands = new Hands({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        })

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.6,
        })

        hands.onResults(onResults)
        handsRef.current = hands

        if (videoRef.current) {
          const camera = new Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && handsRef.current) {
                await handsRef.current.send({ image: videoRef.current })
              }
            },
            width: 480,
            height: 360,
          })

          await camera.start()
          cameraRef.current = camera
          if (isMounted) setCameraActive(true)
        }
      } catch (err) {
        console.error('Camera or MediaPipe Init Error:', err)
        if (isMounted) {
          setCameraError(err.message || 'تعذر تشغيل الكاميرا. يرجى التأكد من إعطاء إذن الكاميرا.')
          setCameraActive(false)
        }
      }
    }

    initMediaPipe()

    return () => {
      isMounted = false
      if (cameraRef.current) {
        cameraRef.current.stop()
        cameraRef.current = null
      }
    }
  }, [isEnabled, onResults])

  return (
    <div className="webcam-tracker-panel" style={{
      background: 'rgba(13, 16, 28, 0.95)',
      border: '1px solid ' + (handDetected ? '#00ff88' : '#2a334a'),
      borderRadius: '10px',
      padding: '12px',
      marginTop: '12px',
      boxShadow: handDetected ? '0 0 15px rgba(0, 255, 136, 0.2)' : 'none',
      transition: 'all 0.3s ease'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📷</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#fff' }}>
              التحكم الحي بالروبوت عبر حركة اليد والكاميرا
            </h3>
            <div style={{ fontSize: '11px', color: '#8899aa' }}>
              Pose2Skill Live Hand Teleoperation (MediaPipe 3D)
            </div>
          </div>
        </div>

        <button
          onClick={onToggle}
          style={{
            background: isEnabled ? '#ff4d4f' : '#00e5ff',
            color: isEnabled ? '#fff' : '#0a0e1a',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {isEnabled ? '⏹️ إيقاف الكاميرا' : '▶️ تشغيل الكاميرا'}
        </button>
      </div>

      {isEnabled && (
        <>
          {cameraError ? (
            <div style={{
              background: 'rgba(255, 77, 79, 0.15)',
              border: '1px solid #ff4d4f',
              borderRadius: '6px',
              padding: '10px',
              color: '#ff7875',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              ⚠️ {cameraError}
            </div>
          ) : (
            <div style={{ position: 'relative', width: '100%', height: '220px', borderRadius: '8px', overflow: 'hidden', background: '#07090e' }}>
              {/* شاشة الفيديو المعكوسة كالمرآة */}
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)', // Mirror mode
                }}
              />
              {/* طبقة رسم نقاط اليد ثلاثية الأبعاد */}
              <canvas
                ref={canvasRef}
                width={480}
                height={360}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  transform: 'scaleX(-1)',
                  pointerEvents: 'none'
                }}
              />

              {/* شارات الحالة المباشرة */}
              <div style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: handDetected ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255, 170, 0, 0.25)',
                border: '1px solid ' + (handDetected ? '#00ff88' : '#ffaa00'),
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '11px',
                color: handDetected ? '#00ff88' : '#ffaa00',
                fontWeight: 'bold'
              }}>
                {handDetected ? '🟢 تم اكتشاف اليد — الروبوت يتبعك الآن' : '🟡 حرك يدك أمام الكاميرا'}
              </div>

              {/* مؤشر القابض (Grasping Meter) */}
              {handDetected && (
                <div style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '8px',
                  right: '8px',
                  background: 'rgba(10, 13, 24, 0.85)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '11px',
                  color: '#fff'
                }}>
                  <div>
                    حالة القابض: <strong style={{ color: isGrasping ? '#ff4d4f' : '#00e5ff' }}>
                      {isGrasping ? '🔒 إمساك (Fist/Pinch)' : '🔓 مفتوح (Open Hand)'}
                    </strong>
                  </div>
                  <div style={{ fontSize: '10px', color: '#8899aa' }}>
                    ضم الإبهام والسبابة للإمساك بالصندوق، وحرك يدك لتحريك الذراع
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
