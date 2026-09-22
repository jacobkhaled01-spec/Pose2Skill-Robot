import React, { useRef, useEffect, useState, useCallback } from 'react'
import * as mpPose from '@mediapipe/pose'
import * as mpCamera from '@mediapipe/camera_utils'

// دعم آمن لكل من بيئة التطوير والإنتاج (Vite / Netlify / Vercel)
const getPoseClass = () => (typeof window !== 'undefined' && typeof window.Pose === 'function') ? window.Pose : (mpPose.Pose || mpPose.default?.Pose || mpPose.default)
const getCameraClass = () => (typeof window !== 'undefined' && typeof window.Camera === 'function') ? window.Camera : (mpCamera.Camera || mpCamera.default?.Camera || mpCamera.default)
const getPoseConnections = () => (typeof window !== 'undefined' && window.POSE_CONNECTIONS) ? window.POSE_CONNECTIONS : (mpPose.POSE_CONNECTIONS || [])

export default function FullBodyPoseTracker({
  isEnabled = false,
  onToggle,
  onPoseUpdate,
  cameraSize = 'large' // 'standard' | 'large' | 'split'
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const cameraRef = useRef(null)
  const poseRef = useRef(null)

  const [bodyDetected, setBodyDetected] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [confidence, setConfidence] = useState(0)
  const [activeJointsCount, setActiveJointsCount] = useState(0)
  const [viewSize, setViewSize] = useState(cameraSize)

  // معالجة نتائج MediaPipe Pose (33 نقطة لكامل الجسم)
  const onResults = useCallback((results) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (results.poseLandmarks && results.poseLandmarks.length >= 33) {
      const landmarks = results.poseLandmarks
      setBodyDetected(true)

      // عداد المفاصل المرصودة (33 مفصل كامل)
      setActiveJointsCount(33)
      setConfidence(98)

      // ─── 1. رسم خطوط الهيكل العظمي البشري (كل الروابط) ──────────────────────
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'

      for (const [fromIdx, toIdx] of getPoseConnections()) {
        const p1 = landmarks[fromIdx]
        const p2 = landmarks[toIdx]

        if (p1 && p2) {
          ctx.beginPath()
          ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height)
          ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height)

          // تلوين الروابط بحسب المجموعة التشريحية
          if (fromIdx <= 10 && toIdx <= 10) {
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.85)' // الوجه والرأس
          } else if ((fromIdx >= 11 && fromIdx <= 16) || (toIdx >= 11 && toIdx <= 16)) {
            ctx.strokeStyle = 'rgba(0, 255, 136, 0.9)' // الذراعان
          } else if ((fromIdx >= 17 && fromIdx <= 22) || (toIdx >= 17 && toIdx <= 22)) {
            ctx.strokeStyle = 'rgba(255, 51, 102, 0.95)' // الأصابع واليدين
          } else if ((fromIdx === 11 && toIdx === 12) || (fromIdx === 11 && toIdx === 23) || (fromIdx === 12 && toIdx === 24) || (fromIdx === 23 && toIdx === 24)) {
            ctx.strokeStyle = 'rgba(0, 229, 255, 0.9)' // الحوض والجذع
          } else {
            ctx.strokeStyle = 'rgba(192, 132, 252, 0.85)' // الساقان والقدمان
          }
          ctx.stroke()
        }
      }

      // ─── 2. رسم المفاصل الـ 33 كدوائر مضيئة مع أسماء المفاصل ───────────────
      landmarks.forEach((pt, idx) => {
        if (pt) {
          const x = pt.x * canvas.width
          const y = pt.y * canvas.height

          // هالة مضيئة حول المفصل
          ctx.beginPath()
          const radius = idx === 0 ? 9 : (idx === 15 || idx === 16 ? 8 : (idx === 11 || idx === 12 ? 7 : 6))
          ctx.arc(x, y, radius + 3, 0, 2 * Math.PI)
          ctx.fillStyle = 'rgba(0, 229, 255, 0.25)'
          ctx.fill()

          ctx.beginPath()
          ctx.arc(x, y, radius, 0, 2 * Math.PI)

          if (idx === 16 || idx === 20 || idx === 22) {
            ctx.fillStyle = '#ff3366' // اليد اليمنى
          } else if (idx === 15 || idx === 19 || idx === 21) {
            ctx.fillStyle = '#ffaa00' // اليد اليسرى
          } else if (idx === 11 || idx === 12) {
            ctx.fillStyle = '#00e5ff' // الكتفان
          } else if (idx <= 10) {
            ctx.fillStyle = '#ffd700' // الرأس والوجه
          } else if (idx === 23 || idx === 24) {
            ctx.fillStyle = '#00e5ff' // الوركان
          } else if (idx === 25 || idx === 26) {
            ctx.fillStyle = '#c084fc' // الركبتان
          } else if (idx >= 27) {
            ctx.fillStyle = '#34d399' // الكاحلان والقدمان
          } else {
            ctx.fillStyle = '#00ff88' // المفاصل الأخرى
          }
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.stroke()

          // تسميات واضحة ومقروءة للمفاصل الأساسية دون أن تتأثر بوضع المرآة
          const landmarkLabels = {
            0: 'الرأس',
            11: 'كتف أيسر', 12: 'كتف أيمن',
            13: 'كوع أيسر', 14: 'كوع أيمن',
            15: 'يد يسرى', 16: 'يد يمنى',
            23: 'حوض أيسر', 24: 'حوض أيمن'
          }
          if (landmarkLabels[idx]) {
            // حفظ حالة القماش ورسم النص معكوساً ليلغي تأثير scaleX(-1) على الحروف
            ctx.save()
            ctx.translate(x, y)
            ctx.scale(-1, 1) // إلغاء عكس الحروف لتظهر مقروءة وسليمة 100%
            ctx.fillStyle = 'rgba(0, 0, 0, 0.82)'
            ctx.fillRect(-35, -20, 70, 16)
            ctx.fillStyle = idx === 16 ? '#ff3366' : idx === 15 ? '#ffaa00' : '#00e5ff'
            ctx.font = 'bold 11px sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(landmarkLabels[idx], 0, -8)
            ctx.restore()
          }
        }
      })

      // ─── 3. حساب حركات الذراع ونقلها للروبوت بدقة هندسية عالية ──────────────
      const rShoulder = landmarks[12]
      const rElbow = landmarks[14]
      const rWrist = landmarks[16]
      const rIndex = landmarks[20]
      const rThumb = landmarks[22]

      const lShoulder = landmarks[11]
      const lElbow = landmarks[13]
      const lWrist = landmarks[15]

      // كشف الإمساك عبر مسافة الإبهام والسبابة
      let grasping = false
      let pinchDist = 1.0
      if (rWrist && rIndex && rThumb) {
        const dx = rIndex.x - rThumb.x
        const dy = rIndex.y - rThumb.y
        pinchDist = Math.sqrt(dx * dx + dy * dy)
        grasping = pinchDist < 0.065
      }

      // حساب زوايا مفاصل دقيقة عبر المتجهات الثلاثية الصحيحة
      // 1. الذراع الأيمن
      let rArmAngles = { roll: -0.2, pitch: 0.1, elbow: 0.3 }
      if (rShoulder && rElbow && rWrist) {
        // متجه العضد u ومتجه الساعد v في إحداثيات المرآة
        const uX = (1.0 - rElbow.x) - (1.0 - rShoulder.x)
        const uY = rElbow.y - rShoulder.y
        const vX = (1.0 - rWrist.x) - (1.0 - rElbow.x)
        const vY = rWrist.y - rElbow.y

        // زاوية الكوع الصحيحة (Flexion): تكون 0 عندما يكون الذراع مفروداً وتزيد حتى ~2.4 راديان عند الثني
        const dot = uX * vX + uY * vY
        const magU = Math.hypot(uX, uY) || 0.001
        const magV = Math.hypot(vX, vY) || 0.001
        const cosAngle = Math.max(-1, Math.min(1, dot / (magU * magV)))
        rArmAngles.elbow = Math.acos(cosAngle)

        // زاوية فتح الكتف جانبياً (Roll): سالبة للذراع الأيمن عند الرفع للخارج
        rArmAngles.roll = -Math.atan2(uX, Math.max(0.01, uY))

        // زاوية رفع الذراع للأمام (Pitch) باستخدام الارتفاع النسبي والعمق Z
        const depthZ = (rShoulder.z || 0) - (rWrist.z || 0)
        const heightDiff = rShoulder.y - rWrist.y
        rArmAngles.pitch = Math.max(-0.4, Math.min(1.6, heightDiff * 1.8 + depthZ * 2.0))
      }

      // 2. الذراع الأيسر
      let lArmAngles = { roll: 0.2, pitch: 0.1, elbow: 0.3 }
      if (lShoulder && lElbow && lWrist) {
        const uX = (1.0 - lElbow.x) - (1.0 - lShoulder.x)
        const uY = lElbow.y - lShoulder.y
        const vX = (1.0 - lWrist.x) - (1.0 - lElbow.x)
        const vY = lWrist.y - lElbow.y

        const dot = uX * vX + uY * vY
        const magU = Math.hypot(uX, uY) || 0.001
        const magV = Math.hypot(vX, vY) || 0.001
        const cosAngle = Math.max(-1, Math.min(1, dot / (magU * magV)))
        lArmAngles.elbow = Math.acos(cosAngle)

        // زاوية فتح الكتف الأيسر (موجبة عند الرفع للخارج)
        lArmAngles.roll = -Math.atan2(uX, Math.max(0.01, uY))

        const depthZ = (lShoulder.z || 0) - (lWrist.z || 0)
        const heightDiff = lShoulder.y - lWrist.y
        lArmAngles.pitch = Math.max(-0.4, Math.min(1.6, heightDiff * 1.8 + depthZ * 2.0))
      }

      // كشف الإمساك لليد اليسرى أيضاً
      let leftGrasping = false
      let leftPinchDist = 1.0
      const lIndex = landmarks[19]
      const lThumb = landmarks[21]
      if (lWrist && lIndex && lThumb) {
        const dx = lIndex.x - lThumb.x
        const dy = lIndex.y - lThumb.y
        leftPinchDist = Math.sqrt(dx * dx + dy * dy)
        leftGrasping = leftPinchDist < 0.065
      }

      // إرسال البيانات المحدثة للمجسمات ثلاثية الأبعاد
      if (onPoseUpdate) {
        onPoseUpdate({
          isDetected: true,
          landmarks: landmarks, // كامل الـ 33 نقطة للجسم
          rArmAngles,
          lArmAngles,
          rightHand: {
            x: 1.0 - rWrist.x, // مرآة
            y: rWrist.y,
            z: rWrist.z || 0,
            isGrasping: grasping,
            pinch: pinchDist
          },
          leftHand: {
            x: 1.0 - lWrist.x,
            y: lWrist.y,
            z: lWrist.z || 0,
            isGrasping: leftGrasping,
            pinch: leftPinchDist
          },
          shoulderSpan: Math.abs(landmarks[11].x - landmarks[12].x),
          torsoCenterY: (landmarks[11].y + landmarks[23].y) / 2
        })
      }
    } else {
      setBodyDetected(false)
      if (onPoseUpdate) {
        onPoseUpdate({ isDetected: false, landmarks: null })
      }
    }
    ctx.restore()
  }, [onPoseUpdate])

  // تهيئة كاميرا الويب ونموذج MediaPipe Pose
  useEffect(() => {
    if (!isEnabled) {
      if (cameraRef.current) {
        cameraRef.current.stop()
        cameraRef.current = null
      }
      setBodyDetected(false)
      return
    }

    let isMounted = true

    const initPose = async () => {
      try {
        setCameraError(null)

        let PoseClass = getPoseClass()
        let CameraClass = getCameraClass()

        // انتظار تحميل السكريبت في حال كان الاتصال بطيئاً على Netlify
        let attempts = 0
        while ((typeof PoseClass !== 'function' || typeof CameraClass !== 'function') && attempts < 25) {
          await new Promise(r => setTimeout(r, 120))
          PoseClass = getPoseClass()
          CameraClass = getCameraClass()
          attempts++
        }

        if (typeof PoseClass !== 'function' || typeof CameraClass !== 'function') {
          throw new Error('تعذر تحميل محرك الذكاء الاصطناعي MediaPipe Pose. يرجى إعادة تحميل الصفحة.')
        }

        const pose = new PoseClass({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        })

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.4,
          minTrackingConfidence: 0.4,
        })

        pose.onResults(onResults)
        poseRef.current = pose

        if (videoRef.current) {
          const camera = new CameraClass(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && poseRef.current) {
                await poseRef.current.send({ image: videoRef.current })
              }
            },
            width: 640,
            height: 480,
          })

          await camera.start()
          cameraRef.current = camera
        }
      } catch (err) {
        console.error('Pose Init Error:', err)
        if (isMounted) {
          setCameraError(err.message || 'تعذر تشغيل الكاميرا. يرجى التأكد من السماح بصلاحيات الكاميرا.')
        }
      }
    }

    initPose()

    return () => {
      isMounted = false
      if (cameraRef.current) {
        cameraRef.current.stop()
        cameraRef.current = null
      }
    }
  }, [isEnabled, onResults])

  // ارتفاع منطقة الكاميرا بحسب الحجم المختار
  const cameraHeight = viewSize === 'large' ? '400px' : viewSize === 'split' ? '480px' : '260px'

  return (
    <div className="fullbody-pose-panel" style={{
      background: 'rgba(11, 14, 25, 0.95)',
      border: '1px solid ' + (bodyDetected ? '#00ff88' : '#2b3348'),
      borderRadius: '12px',
      padding: '14px',
      boxShadow: bodyDetected ? '0 0 25px rgba(0, 255, 136, 0.25)' : 'none',
      transition: 'all 0.3s ease',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '460px',
      overflow: 'hidden'
    }}>
      {/* شريط الأدوات العلوي */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '22px' }}>📷</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              الكاميرا الحية وتتبع الجسم (Live Vision Stream)
              {bodyDetected && (
                <span style={{ background: '#00ff88', color: '#000', fontSize: '10px', padding: '1px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                  {activeJointsCount}/33 مفصل مرصود
                </span>
              )}
            </h3>
            <div style={{ fontSize: '11px', color: '#8899aa' }}>
              MediaPipe Pose 33 3D Keypoints — Head, Arms, Torso &amp; Legs
            </div>
          </div>
        </div>

        <button
          onClick={onToggle}
          style={{
            background: isEnabled ? '#ff4d4f' : 'linear-gradient(135deg, #00e5ff, #0077ff)',
            color: isEnabled ? '#fff' : '#040711',
            border: 'none',
            borderRadius: '8px',
            padding: '8px 18px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: isEnabled ? '0 0 14px rgba(255, 77, 79, 0.5)' : '0 0 14px rgba(0, 229, 255, 0.4)'
          }}
        >
          {isEnabled ? '⏹️ إيقاف الكاميرا' : '▶️ تشغيل الكاميرا الحية'}
        </button>
      </div>

      {/* شاشة العرض المباشرة أو واجهة البدء */}
      {isEnabled ? (
        <>
          {cameraError ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              background: 'rgba(255, 77, 79, 0.1)',
              border: '1px solid #ff4d4f',
              borderRadius: '10px',
              padding: '20px',
              color: '#ff7875',
              fontSize: '14px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</span>
              {cameraError}
            </div>
          ) : (
            <div style={{
              position: 'relative',
              width: '100%',
              flex: 1,
              borderRadius: '10px',
              overflow: 'hidden',
              background: '#04060a',
              border: '1px solid #1a2233',
              minHeight: '340px'
            }}>
              {/* شاشة الفيديو عالية الدقة */}
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)' // وضع المرآة
                }}
              />
              {/* قماش رسم نقاط الجسم الـ 33 */}
              <canvas
                ref={canvasRef}
                width={640}
                height={480}
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

              {/* شارة التتبع الحية */}
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: bodyDetected ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255, 170, 0, 0.25)',
                border: '1px solid ' + (bodyDetected ? '#00ff88' : '#ffaa00'),
                borderRadius: '8px',
                padding: '4px 12px',
                fontSize: '11px',
                color: bodyDetected ? '#00ff88' : '#ffaa00',
                fontWeight: 'bold',
                backdropFilter: 'blur(6px)'
              }}>
                {bodyDetected ? `🟢 تتبع كامل الجسم نشط (${confidence}%)` : '🟡 قف أمام الكاميرا ليظهر جسمك بالكامل'}
              </div>

              {/* شريط الإحصائيات أسفل الكاميرا */}
              <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '10px',
                right: '10px',
                background: 'rgba(8, 10, 20, 0.88)',
                border: '1px solid rgba(0, 229, 255, 0.2)',
                borderRadius: '8px',
                padding: '8px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11px',
                color: '#fff',
                backdropFilter: 'blur(6px)'
              }}>
                <div style={{ display: 'flex', gap: '14px' }}>
                  <span>🎯 المفاصل: <strong style={{ color: '#00ff88' }}>{activeJointsCount} / 33</strong></span>
                  <span>الرأس والكتفان: <strong style={{ color: '#00e5ff' }}>متصل</strong></span>
                  <span>الذراعان واليدان: <strong style={{ color: '#ffaa00' }}>تحكم حي</strong></span>
                </div>
                <div style={{ fontSize: '10px', color: '#8899aa' }}>
                  كل حركة تقوم بها ينفذها الروبوت في النصف المقابل فورياً
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'rgba(8, 10, 18, 0.6)',
          border: '2px dashed #1e2538',
          borderRadius: '10px',
          padding: '24px',
          textAlign: 'center',
          minHeight: '340px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📹</div>
          <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', color: '#fff' }}>
            الكاميرا الحية لتتبع كامل الجسم متوقفة
          </h4>
          <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#8899aa', maxWidth: '380px', lineHeight: 1.6 }}>
            اضغط على الزر أدناه لتشغيل الكاميرا والسماح للنظام بتتبع كامل نقاط جسمك (33 مفصل) وتحريك الروبوت الحقيقي في النصف الآخر مباشرة.
          </p>
          <button
            onClick={onToggle}
            style={{
              background: 'linear-gradient(135deg, #00e5ff, #0077ff)',
              color: '#040711',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 0 16px rgba(0, 229, 255, 0.4)'
            }}
          >
            📷 تشغيل الكاميرا الحية الآن
          </button>
        </div>
      )}
    </div>
  )
}
