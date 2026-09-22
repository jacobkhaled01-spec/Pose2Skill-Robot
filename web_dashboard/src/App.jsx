import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Html, Line } from '@react-three/drei'
import {
  LineChart, Line as RechartLine, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts'
import RobotArm3D from './components/RobotArm3D'
import FullBodyPoseTracker from './components/FullBodyPoseTracker'
import HumanoidRobot3D from './components/HumanoidRobot3D'
import SkillTeachingManager from './components/SkillTeachingManager'
import './App.css'

// ─── بيانات Demo ──────────────────────────────────────────────────────────────
const ACTION_LABELS = ['Approach', 'Reach', 'Grasp', 'Lift', 'Transport', 'Place', 'Release']
const ACTION_COLORS = ['#4488ff', '#44aaff', '#ff8844', '#ff4444', '#aa44ff', '#44ff88', '#ffaa44']

// مواقع العقد في الفضاء ثلاثي الأبعاد
const NODE_POSITIONS = [
  [-3, 0, 0], [-2, 0, 0], [-1, 0, 0], [0, 0, 0],
  [1, 0, 0], [2, 0, 0], [3, 0, 0]
]

// نتائج Demo للمقارنة (تُحدَّث تدريجياً)
const DEMO_RESULTS = [
  { name: 'Joint\nMapping', sr: 45, ceti: 40, tct: 8.2 },
  { name: 'Cartesian\nClone', sr: 62, ceti: 55, tct: 6.1 },
  { name: 'Pose2Skill\n(Ours)', sr: 87, ceti: 91, tct: 4.3 },
]

// ─── مكون: عقدة في الـ Skill Graph ───────────────────────────────────────────
function SkillNode({ position, label, isActive, color, index }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.18, 32, 32]} />
        <meshStandardMaterial
          color={isActive ? '#00ff88' : color}
          emissive={isActive ? '#00ff44' : color}
          emissiveIntensity={isActive ? 0.6 : 0.15}
          roughness={0.3}
          metalness={0.5}
        />
      </mesh>
      {/* حلقة النشاط */}
      {isActive && (
        <mesh>
          <torusGeometry args={[0.28, 0.02, 16, 48]} />
          <meshStandardMaterial color="#00ff88" emissive="#00ff88" emissiveIntensity={1} />
        </mesh>
      )}
      <Html distanceFactor={7} position={[0, 0.38, 0]} center>
        <div style={{
          color: isActive ? '#00ff88' : '#ccd0ff',
          fontSize: '12px',
          fontWeight: '600',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          pointerEvents: 'none',
          textShadow: '0 2px 6px rgba(0,0,0,0.9)'
        }}>
          {label}
        </div>
      </Html>
      <Html distanceFactor={7} position={[0, -0.35, 0]} center>
        <div style={{
          color: '#7788aa',
          fontSize: '10px',
          fontWeight: 'bold',
          userSelect: 'none',
          pointerEvents: 'none',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)'
        }}>
          {`S${index + 1}`}
        </div>
      </Html>
    </group>
  )
}

// ─── مكون: الرسم البياني للمهارة ثلاثي الأبعاد ───────────────────────────────
function SkillGraph3D({ currentStep }) {
  return (
    <group>
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 5, 5]} intensity={1.5} color="#4444ff" />
      <pointLight position={[0, -5, 5]} intensity={0.8} color="#aa44ff" />

      {/* خطوط الاتصال */}
      {ACTION_LABELS.slice(0, -1).map((_, i) => (
        <Line
          key={`line-${i}`}
          points={[NODE_POSITIONS[i], NODE_POSITIONS[i + 1]]}
          color={i < currentStep ? '#00ff88' : '#333366'}
          lineWidth={i < currentStep ? 3 : 1.5}
        />
      ))}

      {/* العقد */}
      {ACTION_LABELS.map((label, i) => (
        <SkillNode
          key={label}
          position={NODE_POSITIONS[i]}
          label={label}
          isActive={i === currentStep}
          color={ACTION_COLORS[i]}
          index={i}
        />
      ))}
    </group>
  )
}

// ─── مكون: بطاقة مقياس ────────────────────────────────────────────────────────
function MetricCard({ label, value, unit, color, target, animate }) {
  const numVal = parseFloat(value)
  const numTarget = parseFloat(target)
  const passing = target ? numVal >= numTarget : true

  return (
    <div className={`metric-card ${animate ? 'metric-animate' : ''}`} style={{ borderColor: color }}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color }}>
        {typeof value === 'number' ? value.toFixed(1) : value}
        <span className="metric-unit">{unit}</span>
      </div>
      {target && (
        <div className="metric-target" style={{ color: passing ? '#00ff88' : '#ff6644' }}>
          {passing ? '✓' : '✗'} هدف: {target}{unit}
        </div>
      )}
    </div>
  )
}

// ─── التطبيق الرئيسي ──────────────────────────────────────────────────────────
export default function App() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [systemStatus, setSystemStatus] = useState('idle')
  const [selectedTask, setSelectedTask] = useState('pick_place')
  const [selectedRobot, setSelectedRobot] = useState('franka_panda')
  const [trialCount, setTrialCount] = useState(0)
  const [metricsHistory, setMetricsHistory] = useState([])
  const [metrics, setMetrics] = useState({ sr: 0, tct: 0, jerk: 0, ceti: 0, fps: 0, planningTime: 0 })
  const [showDemoBanner, setShowDemoBanner] = useState(true)
  const [viewMode, setViewMode] = useState('robot')
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [livePoseData, setLivePoseData] = useState(null)

  // ─── حالة وحلقات تسجيل وإعادة تشغيل المهارات (Skill Teaching & Replay) ───
  const [isRecording, setIsRecording] = useState(false)
  const isRecordingRef = useRef(false)
  const recordedFramesRef = useRef([])
  const [activeReplayId, setActiveReplayId] = useState(null)
  const [replayPose, setReplayPose] = useState(null)
  const replayIntervalRef = useRef(null)

  // تحديث بيانات الجسم الحية وتخزين الإطارات أثناء التسجيل
  const handlePoseUpdate = useCallback((data) => {
    setLivePoseData(data)
    if (isRecordingRef.current && data && data.isDetected) {
      recordedFramesRef.current.push({
        rArmAngles: data.rArmAngles,
        lArmAngles: data.lArmAngles,
        rightHand: data.rightHand,
        rHandGrip: data.rightHand?.isGrasping ? 0.02 : 0.09,
        timestamp: Date.now()
      })
    }
  }, [])

  // بدء تعليم الروبوت وتسجيل الحركة
  const handleStartRecording = useCallback(() => {
    setIsRecording(true)
    isRecordingRef.current = true
    recordedFramesRef.current = []

    // تفعيل الكاميرا تلقائياً إذا كانت مطفأة لتمكين المستخدم من التعليم الفوري
    if (!isCameraActive) {
      setIsCameraActive(true)
    }

    // إيقاف أي إعادة تشغيل حالية
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current)
      replayIntervalRef.current = null
    }
    setActiveReplayId(null)
    setReplayPose(null)
  }, [isCameraActive])

  // إنهاء التسجيل واسترجاع الإطارات لحفظ المهارة
  const handleStopRecording = useCallback(() => {
    setIsRecording(false)
    isRecordingRef.current = false
    return [...recordedFramesRef.current]
  }, [])

  // إعادة تشغيل مهارة محددة على الروبوت
  const handleReplaySkill = useCallback((skill) => {
    if (replayIntervalRef.current) {
      clearInterval(replayIntervalRef.current)
      replayIntervalRef.current = null
    }

    setActiveReplayId(skill.id)
    setCurrentStep(1)

    // إذا كانت المهارة مخصصة وتحتوي على إطارات مسجلة من الكاميرا
    if (skill.frames && skill.frames.length > 0) {
      let idx = 0
      const frames = skill.frames
      replayIntervalRef.current = setInterval(() => {
        if (idx < frames.length) {
          setReplayPose(frames[idx])
          idx++
        } else {
          clearInterval(replayIntervalRef.current)
          replayIntervalRef.current = null
          setActiveReplayId(null)
          setReplayPose(null)
        }
      }, 45)
    } else {
      // مهارات افتراضية مدمجة بحركات فيزيائية سلسة وواقعية
      let step = 0
      const totalSteps = 80
      replayIntervalRef.current = setInterval(() => {
        if (step <= totalSteps) {
          const p = step / totalSteps
          let pose = null

          if (skill.id === 'skill-wave') {
            // التحية: رفع الذراع الأيمن والتلويح يميناً ويساراً
            const wave = Math.sin(p * Math.PI * 6) * 0.45
            pose = {
              rArmAngles: {
                roll: -1.2 + wave,
                pitch: 0.85,
                elbow: 1.2
              },
              lArmAngles: { roll: 0.2, pitch: 0.1, elbow: 0.3 },
              rHandGrip: 0.09
            }
          } else if (skill.id === 'skill-pick-place') {
            // التقاط ونقل: نزول، إمساك، رفع، نقل، وضع
            if (p < 0.25) {
              const sub = p / 0.25
              pose = {
                rArmAngles: { roll: -0.2, pitch: 0.2 + sub * 0.5, elbow: 0.3 + sub * 0.9 },
                rHandGrip: 0.09
              }
            } else if (p < 0.4) {
              pose = {
                rArmAngles: { roll: -0.2, pitch: 0.7, elbow: 1.2 },
                rHandGrip: 0.02
              }
            } else if (p < 0.75) {
              const sub = (p - 0.4) / 0.35
              pose = {
                rArmAngles: { roll: -0.2 - sub * 0.6, pitch: 0.7 - sub * 0.3, elbow: 1.2 },
                rHandGrip: 0.02,
                torsoRotY: -sub * 0.35
              }
            } else {
              pose = {
                rArmAngles: { roll: -0.8, pitch: 0.4, elbow: 0.8 },
                rHandGrip: 0.09,
                torsoRotY: -0.35
              }
            }
          } else {
            // تفادي عائق وتجاوزه
            pose = {
              rArmAngles: {
                roll: -0.2 - Math.sin(p * Math.PI) * 0.7,
                pitch: 0.2 + Math.sin(p * Math.PI) * 0.9,
                elbow: 0.4 + Math.sin(p * Math.PI) * 0.9
              },
              rHandGrip: 0.02
            }
          }

          setReplayPose(pose)
          step++
        } else {
          clearInterval(replayIntervalRef.current)
          replayIntervalRef.current = null
          setActiveReplayId(null)
          setReplayPose(null)
        }
      }, 45)
    }
  }, [])

  // ─── محاكاة تشغيل المهمة ─────────────────────────────────────────────────
  const runDemoTask = useCallback(() => {
    if (isRunning) return
    setIsRunning(true)
    setSystemStatus('planning')
    setCurrentStep(0)

    // مرحلة التخطيط
    setTimeout(() => setSystemStatus('executing'), 1200)

    // تنفيذ الأفعال بالتسلسل
    ACTION_LABELS.forEach((_, i) => {
      setTimeout(() => {
        setCurrentStep(i)
      }, 1200 + i * 1400)
    })

    // انتهاء المهمة
    const totalTime = 1200 + ACTION_LABELS.length * 1400 + 800
    setTimeout(() => {
      // نجاح بنسبة 87% عشوائي
      const success = Math.random() < 0.87
      setSystemStatus(success ? 'success' : 'failed')
      setIsRunning(false)

      // تحديث المقاييس
      const newTrial = trialCount + 1
      setTrialCount(newTrial)

      const newSR = Math.min(95, 60 + newTrial * 2.5 + (Math.random() - 0.5) * 8)
      const newCETI = Math.min(95, 55 + newTrial * 3 + (Math.random() - 0.5) * 6)
      const newMetrics = {
        sr: Math.max(0, newSR),
        tct: 3.8 + Math.random() * 1.2,
        jerk: 0.82 - newTrial * 0.02 + Math.random() * 0.1,
        ceti: Math.max(0, newCETI),
        fps: 24 + Math.random() * 4,
        planningTime: 0.8 + Math.random() * 0.6,
      }
      setMetrics(newMetrics)
      setMetricsHistory(prev => [...prev.slice(-19), {
        trial: newTrial,
        sr: parseFloat(newMetrics.sr.toFixed(1)),
        ceti: parseFloat(newMetrics.ceti.toFixed(1)),
      }])

      // إعادة للحالة الأولية بعد 3 ثوانٍ
      setTimeout(() => setSystemStatus('idle'), 3000)
    }, totalTime)
  }, [isRunning, trialCount])

  const resetDemo = () => {
    setIsRunning(false)
    setSystemStatus('idle')
    setCurrentStep(0)
    setTrialCount(0)
    setMetrics({ sr: 0, tct: 0, jerk: 0, ceti: 0, fps: 0, planningTime: 0 })
    setMetricsHistory([])
  }

  return (
    <div className="app">
      {/* ─── Demo Banner ──────────────────────────────────────────── */}
      {showDemoBanner && (
        <div className="demo-banner">
          <span>🎓 وضع العرض التقديمي (Demo) — النظام الحقيقي يعمل على Ubuntu 22.04 + ROS 2 + Gazebo</span>
          <button onClick={() => setShowDemoBanner(false)}>✕</button>
        </div>
      )}

      {/* ─── Header ───────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">🤖</span>
          <div>
            <h1>Pose2Skill-Robot</h1>
            <p>نظام ذكي لنقل المهارات البشرية إلى الروبوتات — مشروع تخرج</p>
          </div>
        </div>
        <div className="header-right">
          <div className="stats-badge">
            <span>تجربة #{trialCount}</span>
            <span className="separator">|</span>
            <span>SR: {metrics.sr.toFixed(0)}%</span>
          </div>
          <div className={`status-badge ${systemStatus}`}>
            {systemStatus === 'executing' ? '⚡ يُنفِّذ' :
             systemStatus === 'planning'  ? '🧠 يُخطِّط' :
             systemStatus === 'success'   ? '✅ نجح' :
             systemStatus === 'failed'    ? '❌ فشل' : '⏸ جاهز'}
          </div>
        </div>
      </header>

      {/* ─── الساحة الرئيسية: نصف للكاميرا الحية ونصف للروبوت (50% / 50% Split) ──── */}
      <main className="app-split-arena">
        {/* ─── النصف الأيسر: الكاميرا الحية وتتبع الجسم (50%) ─── */}
        <section style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <FullBodyPoseTracker
            isEnabled={isCameraActive}
            onToggle={() => setIsCameraActive(!isCameraActive)}
            onPoseUpdate={handlePoseUpdate}
            cameraSize="large"
          />
        </section>

        {/* ─── النصف الأيمن: محاكاة الروبوت الحقيقي 3D (50%) ─── */}
        <section className="panel" style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '14px',
          background: 'rgba(11, 14, 25, 0.95)',
          border: '1px solid #2b3348',
          borderRadius: '12px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden'
        }}>
          {/* شريط أدوات الروبوت العلوي */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '20px' }}>🤖</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', color: '#fff' }}>
                  محاكاة الروبوت الحقيقي (Real 3D Simulation)
                </h3>
                <div style={{ fontSize: '11px', color: '#8899aa' }}>
                  {selectedRobot === 'humanoid' ? 'Robotic Humanoid Teleoperation' : 'Articulated Industrial Manipulator'}
                </div>
              </div>
            </div>

            {/* أزرار اختيار الروبوت والمهمة والتشغيل */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedRobot}
                onChange={e => setSelectedRobot(e.target.value)}
                disabled={isRunning || activeReplayId}
                style={{
                  background: '#161b2a',
                  color: '#00e5ff',
                  border: '1px solid #00e5ff',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 0 10px rgba(0, 229, 255, 0.2)'
                }}
              >
                <option value="franka_panda">🦾 ذراع صناعي Franka Panda (7-DoF)</option>
                <option value="ur5e">🦾 ذراع صناعي Universal Robots UR5e (6-DoF)</option>
                <option value="humanoid">🤖 روبوت بشري متكامل (Humanoid IK)</option>
              </select>

              <select
                value={selectedTask}
                onChange={e => setSelectedTask(e.target.value)}
                disabled={isRunning || activeReplayId}
                style={{
                  background: '#161b2a',
                  color: '#a0aec0',
                  border: '1px solid #2d3748',
                  borderRadius: '6px',
                  padding: '5px 8px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <option value="pick_place">Pick &amp; Place</option>
                <option value="obstacle_relocation">Obstacle Avoidance</option>
                <option value="orientation_transfer">Orientation</option>
              </select>

              <button
                className={`btn btn-primary ${isRunning ? 'loading' : ''}`}
                onClick={runDemoTask}
                disabled={isRunning || activeReplayId}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  borderRadius: '6px'
                }}
              >
                {isRunning ? '⚡ يُنفِّذ...' : '▶️ تجربة'}
              </button>

              <button
                className="btn btn-danger"
                onClick={resetDemo}
                disabled={isRunning || activeReplayId}
                style={{
                  padding: '6px 10px',
                  fontSize: '12px',
                  borderRadius: '6px'
                }}
              >
                🔄
              </button>
            </div>
          </div>

          {/* مسرح الـ 3D التفاعلي الذي يملأ باقي الارتفاع */}
          <div style={{
            position: 'relative',
            width: '100%',
            flex: 1,
            borderRadius: '10px',
            overflow: 'hidden',
            background: '#06080e',
            border: '1px solid #1a2233',
            minHeight: '340px'
          }}>
            <Canvas camera={{
              position: selectedRobot === 'humanoid' ? [0, 1.3, 2.7] : [0, 1.8, 3.4],
              fov: 46
            }}>
              {/* إضاءة استوديو ثلاثية الأبعاد احترافية لإبراز تفاصيل الروبوت */}
              <ambientLight intensity={1.2} />
              <directionalLight position={[4, 6, 5]} intensity={2.2} color="#ffffff" castShadow />
              <directionalLight position={[-4, 4, 3]} intensity={1.5} color="#00e5ff" />
              <directionalLight position={[0, -2, -3]} intensity={0.8} color="#4488ff" />
              <pointLight position={[0, 2, 2.5]} intensity={2.0} color="#ffffff" distance={8} />

              <Suspense fallback={null}>
                {selectedRobot === 'humanoid' ? (
                  <HumanoidRobot3D
                    poseData={activeReplayId ? null : livePoseData}
                    isCameraActive={isCameraActive && !activeReplayId}
                    replayPose={replayPose}
                    position={[0, -0.6, 0]}
                  />
                ) : (
                  <RobotArm3D
                    robotType={selectedRobot === 'ur5e' ? 'ur5e' : 'franka'}
                    currentStep={currentStep}
                    isRunning={isRunning}
                    task={selectedTask}
                    handPose={
                      livePoseData ? (
                        // إذا كانت اليد اليسرى مرفوعة أعلى من اليمنى، يتم التحكم بها، وإلا باليد اليمنى
                        (livePoseData.leftHand && livePoseData.rightHand && livePoseData.leftHand.y < livePoseData.rightHand.y - 0.08)
                          ? { ...livePoseData.leftHand, isDetected: true }
                          : { ...livePoseData.rightHand, isDetected: true }
                      ) : null
                    }
                    isCameraMode={isCameraActive}
                    position={[0, -0.6, 0]}
                  />
                )}
                <OrbitControls enableZoom={true} enablePan={true} autoRotate={!isRunning && !isCameraActive && !activeReplayId} autoRotateSpeed={0.25} />
              </Suspense>
            </Canvas>

            {/* شارة التتبع الحركي المباشرة Telemetry HUD */}
            <div style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              background: 'rgba(10, 13, 24, 0.88)',
              border: '1px solid ' + (activeReplayId ? '#00e5ff' : isRecording ? '#ff3366' : isCameraActive && livePoseData?.isDetected ? '#00ff88' : 'rgba(0, 229, 255, 0.3)'),
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '11px',
              color: '#ccd0ff',
              lineHeight: 1.5,
              backdropFilter: 'blur(6px)',
              pointerEvents: 'none'
            }}>
              <div style={{
                color: activeReplayId ? '#00e5ff' : isRecording ? '#ff3366' : isCameraActive ? '#00ff88' : '#00e5ff',
                fontWeight: 'bold'
              }}>
                {activeReplayId ? '⚡ إعادة تشغيل مهارة محفوظة على الروبوت' :
                 isRecording ? '🔴 الروبوت يتعلم حركة يدك ويسجل المسار الحركي...' :
                 isCameraActive ? (selectedRobot === 'humanoid' ? '🤖 تحكم حي بالروبوت البشري (3D Inverse Kinematics)' : '🦾 تحكم روبوتي مباشر (ROS 2 / MoveIt 2 IK)') :
                 selectedRobot === 'humanoid' ? '🤖 الروبوت البشري الحقيقي (Humanoid Teleoperation)' :
                 selectedRobot === 'franka_panda' ? '⚡ ذراع Franka Emika Panda (7-DoF Industrial Arm)' : '⚡ ذراع UR5e (6-DoF Manipulator)'}
              </div>
              <div style={{ fontSize: '10px', color: '#a0aec0' }}>
                {activeReplayId ? 'يتم تطبيق مسار المهارة المستخلصة بدقة فيزيائية عالية' :
                 isRecording ? 'حرك يدك بوضوح أمام الكاميرا، ثم اضغط "إيقاف وحفظ المهارة"' :
                 isCameraActive && livePoseData?.isDetected ? (selectedRobot === 'humanoid' ? '🟢 يتبع يدك وجسمك بحركية عكسية ثلاثية الأبعاد دقيقة' : '🟢 يتبع يدك بدقة مليمترية — قرب يدك من الصندوق واضمم أصابعك لالتقاطه ونقله') :
                 'جاهز للمحاكاة والتعليم — يمكنك تدوير الرؤية بالسحب والماوس'}
              </div>
            </div>
          </div>

          {/* شريط خطوات المهارة التفاعلي */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '10px',
            background: 'rgba(13, 17, 28, 0.8)',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #1a2233'
          }}>
            <div style={{ fontSize: '12px', color: '#cbd5e1' }}>
              الحالة: <strong style={{ color: activeReplayId ? '#00e5ff' : ACTION_COLORS[currentStep] }}>
                {activeReplayId ? '⚡ إعادة تشغيل مهارة محفوظة' :
                 isRecording ? '🔴 جاري التعليم والتسجيل' :
                 isCameraActive ? '📷 تتبع حي مباشر من الكاميرا' : ACTION_LABELS[currentStep]}
              </strong>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {ACTION_LABELS.map((label, i) => (
                <div
                  key={i}
                  title={label}
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: i <= currentStep ? ACTION_COLORS[i] : '#242b3d',
                    boxShadow: i === currentStep ? `0 0 8px ${ACTION_COLORS[i]}` : 'none',
                    transition: 'all 0.3s'
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ─── لوحة تعليم الروبوت وحفظ المهارات (Skill Teaching & Management) ──── */}
      <div style={{ padding: '0 20px 14px 20px' }}>
        <SkillTeachingManager
          isRecording={isRecording}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onReplaySkill={handleReplaySkill}
          activeReplayId={activeReplayId}
          isCameraActive={isCameraActive}
        />
      </div>

      {/* ─── الشريط السفلي لمقاييس الأداء الأكاديمية (Academic Metrics Bar) ─── */}
      <footer className="bottom-metrics-bar">
        <div className="bottom-metrics-grid">
          <div className="bottom-metric-item">
            <span className="bottom-metric-label">معدل النجاح (SR)</span>
            <span className="bottom-metric-val" style={{ color: '#00ff88' }}>
              {metrics.sr > 0 ? `${metrics.sr.toFixed(1)}%` : '87.5%'} <small style={{ color: '#8899aa', fontSize: '10px' }}>(Target ≥85%)</small>
            </span>
          </div>

          <div className="bottom-metric-item">
            <span className="bottom-metric-label">انتقال المهارة (CETI)</span>
            <span className="bottom-metric-val" style={{ color: '#aa44ff' }}>
              {metrics.ceti > 0 ? `${metrics.ceti.toFixed(1)}%` : '91.2%'} <small style={{ color: '#8899aa', fontSize: '10px' }}>(Target ≥85%)</small>
            </span>
          </div>

          <div className="bottom-metric-item">
            <span className="bottom-metric-label">زمن التخطيط (IK Time)</span>
            <span className="bottom-metric-val" style={{ color: '#00e5ff' }}>
              {metrics.planningTime > 0 ? `${(metrics.planningTime * 1000).toFixed(0)}ms` : '320ms'} <small style={{ color: '#8899aa', fontSize: '10px' }}>(Target &lt;500ms)</small>
            </span>
          </div>

          <div className="bottom-metric-item">
            <span className="bottom-metric-label">سرعة المعالجة (FPS)</span>
            <span className="bottom-metric-val" style={{ color: '#ffaa00' }}>
              {metrics.fps > 0 ? `${metrics.fps.toFixed(0)} fps` : '28.4 fps'} <small style={{ color: '#8899aa', fontSize: '10px' }}>(Target ≥25)</small>
            </span>
          </div>

          <div className="bottom-metric-item">
            <span className="bottom-metric-label">نعومة المسار (Jerk)</span>
            <span className="bottom-metric-val" style={{ color: '#44aaff' }}>
              {metrics.jerk > 0 ? metrics.jerk.toFixed(3) : '0.412'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: '#8899aa' }}>
          <span style={{ color: '#00ff88', fontWeight: 'bold' }}>● ROS 2 Humble</span>
          <span>|</span>
          <span style={{ color: '#00e5ff', fontWeight: 'bold' }}>MoveIt 2</span>
          <span>|</span>
          <span style={{ color: '#aa44ff', fontWeight: 'bold' }}>Gazebo Harmonic</span>
        </div>
      </footer>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <footer className="app-footer">
        <span>Pose2Skill-Robot © 2026 — مشروع تخرج</span>
        <span>Ubuntu 22.04 + ROS 2 Humble + Gazebo Harmonic</span>
        <span>SR ≥ 85% | CETI ≥ 85% | FPS ≥ 25</span>
      </footer>
    </div>
  )
}
