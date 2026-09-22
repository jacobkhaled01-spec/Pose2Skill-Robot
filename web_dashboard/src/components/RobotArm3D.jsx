import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

// ─── إعدادات الحركية لكل مرحلة من مراحل المهارة ──────────────────────────────
// الإحداثيات: [shoulder_pan, shoulder_lift, elbow, wrist_pitch, wrist_roll, gripper_open, block_held]
const FRANKA_KEYFRAMES = [
  // 0: Ready / Approach
  { pan: 0.0, lift: -0.35, elbow: 0.8, wrist: -0.45, roll: 0.0, gripper: 0.14, blockAttached: false, eePos: [0.0, 1.8, 1.4] },
  // 1: Reach
  { pan: 0.55, lift: -0.75, elbow: 1.45, wrist: -0.7, roll: 0.2, gripper: 0.14, blockAttached: false, eePos: [1.2, 0.5, 0.9] },
  // 2: Grasp
  { pan: 0.55, lift: -0.85, elbow: 1.6, wrist: -0.75, roll: 0.2, gripper: 0.045, blockAttached: true, eePos: [1.2, 0.35, 0.9] },
  // 3: Lift
  { pan: 0.55, lift: -0.4, elbow: 1.1, wrist: -0.7, roll: 0.2, gripper: 0.045, blockAttached: true, eePos: [1.2, 1.3, 0.9] },
  // 4: Transport
  { pan: -0.55, lift: -0.3, elbow: 0.95, wrist: -0.65, roll: -0.2, gripper: 0.045, blockAttached: true, eePos: [-1.2, 1.4, 0.9] },
  // 5: Place
  { pan: -0.55, lift: -0.85, elbow: 1.6, wrist: -0.75, roll: -0.2, gripper: 0.045, blockAttached: true, eePos: [-1.2, 0.35, 0.9] },
  // 6: Release & Retract
  { pan: 0.0, lift: -0.35, elbow: 0.8, wrist: -0.45, roll: 0.0, gripper: 0.14, blockAttached: false, eePos: [0.0, 1.8, 1.4] },
]

export default function RobotArm3D({
  robotType = 'franka',
  currentStep = 0,
  isRunning = false,
  task = 'pick_place',
  handPose = null,
  isCameraMode = false,
  position = [0, -0.6, 0]
}) {
  // مراجع مفاصل الروبوت
  const shoulderPanRef = useRef()
  const shoulderLiftRef = useRef()
  const elbowRef = useRef()
  const wristPitchRef = useRef()
  const wristRollRef = useRef()
  const gripperLeftRef = useRef()
  const gripperRightRef = useRef()
  const blockRef = useRef()
  const eeMarkerRef = useRef()

  // هل الصندوق ملتقط حالياً في وضع الكاميرا
  const isHoldingBlock = useRef(false)

  // حالة زوايا المفاصل الحالية للتنعيم (Interpolation)
  const currentAngles = useRef({
    pan: 0,
    lift: -0.35,
    elbow: 0.8,
    wrist: -0.45,
    roll: 0,
    gripper: 0.14,
    blockY: 0.18,
    blockX: 1.2,
    blockZ: 0.9,
  })

  // ألوان ونمط الروبوت حسب النوع (Franka أبيض/رمادي صناعي، UR5e فضي/أزرق ميتالك)
  const isFranka = robotType === 'franka'
  const linkColor = isFranka ? '#f0f2f5' : '#7d8c99'
  const jointColor = isFranka ? '#2b2d35' : '#0077c8'
  const accentColor = isFranka ? '#ff4d4f' : '#00a3e0'

  // المسار الحركي ثلاثي الأبعاد المرسوم في الهواء
  const trajectoryPoints = useMemo(() => {
    const pts = []
    const start = new THREE.Vector3(1.2, 0.35, 0.9)
    const mid1 = new THREE.Vector3(1.2, 1.3, 0.9)
    const mid2 = new THREE.Vector3(0.0, task === 'obstacle' ? 1.7 : 1.4, 1.1)
    const mid3 = new THREE.Vector3(-1.2, 1.3, 0.9)
    const end = new THREE.Vector3(-1.2, 0.35, 0.9)
    const curve = new THREE.CatmullRomCurve3([start, mid1, mid2, mid3, end])
    return curve.getPoints(40)
  }, [task])

  const trajectoryGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(trajectoryPoints)
  }, [trajectoryPoints])

  // تحديث الحركات في كل فريم (60 FPS Smooth Interpolation)
  useFrame((state, delta) => {
    let targetPan = 0
    let targetLift = -0.35
    let targetElbow = 0.8
    let targetWrist = -0.45
    let targetRoll = 0
    let targetGripper = 0.14
    let speed = 3.5

    // ─── الوضع المباشر: تتبع حركة يد المستخدم عبر Inverse Kinematics (IK) ───
    if (isCameraMode && handPose && handPose.isDetected) {
      speed = 10.0 // استجابة فيزيائية سريعة وناعمة

      // 1. تحويل موضع اليد من الكاميرا إلى فضاء العمل الفيزيائي ثلاثي الأبعاد بدقة
      const targetX = THREE.MathUtils.clamp((0.5 - handPose.x) * 2.6, -1.5, 1.5)
      const targetY = THREE.MathUtils.clamp(0.24 + (0.85 - handPose.y) * 1.6, 0.22, 1.85)
      const targetZ = THREE.MathUtils.clamp(0.95 + (handPose.z || 0) * 1.4, 0.65, 1.35)

      // 2. حل الحركية العكسية التحليلية (Analytical Inverse Kinematics - 6 DoF)
      // مفصل القاعدة: الدوران نحو النقطة المستهدفة
      targetPan = Math.atan2(targetX, targetZ)

      // المسافة الأفقية من محور الكتف
      const rHoriz = Math.hypot(targetX, targetZ)
      // الارتفاع العمودي بالنسبة لمفصل الكتف (Y = 0.54)
      const hVert = targetY - 0.54

      // طول العضد L1 والساعد مع القابض L2
      const L1 = 1.10
      const L2 = 1.05
      const dist = Math.hypot(rHoriz, hVert)
      // حصر المسافة ضمن مدى الوصول الفيزيائي للروبوت لمنع التفرد (Singularity)
      const clampedDist = THREE.MathUtils.clamp(dist, 0.45, (L1 + L2) - 0.04)

      // قانون جيب التمام لحساب زاوية الكوع بدقة رياضية (Elbow Angle)
      const cosElbow = (L1 * L1 + L2 * L2 - clampedDist * clampedDist) / (2 * L1 * L2)
      targetElbow = Math.PI - Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1))

      // زاوية رفع الكتف (Shoulder Lift)
      const alpha = Math.atan2(hVert, rHoriz)
      const cosLift = (L1 * L1 + clampedDist * clampedDist - L2 * L2) / (2 * L1 * clampedDist)
      const beta = Math.acos(THREE.MathUtils.clamp(cosLift, -1, 1))
      targetLift = -(alpha + beta - Math.PI / 2)

      // زاوية المعصم (Wrist Pitch) لتوجيه القابض دوماً عمودياً نحو الطاولة والأجسام
      targetWrist = -(targetLift + targetElbow) - 0.25

      // دوران المعصم الأفقي
      targetRoll = THREE.MathUtils.clamp(targetX * 0.15, -0.4, 0.4)

      // التحكم بأصابع القابض (Gripper): عند ضم الأصابع يتم إغلاق القابض بإحكام
      targetGripper = handPose.isGrasping ? 0.04 : 0.14
    } else {
      // الوضع التلقائي المجدول للمهارة
      const target = FRANKA_KEYFRAMES[Math.min(currentStep, FRANKA_KEYFRAMES.length - 1)]
      targetPan = target.pan
      targetLift = target.lift
      targetElbow = target.elbow
      targetWrist = target.wrist
      targetRoll = target.roll
      targetGripper = target.gripper
      speed = isRunning ? 5.5 : 3.0
    }

    // تنعيم زوايا المفاصل باستخدام MathUtils.damp للتحرك بسلاسة روبوتية واقعية
    currentAngles.current.pan = THREE.MathUtils.damp(currentAngles.current.pan, targetPan, speed, delta)
    currentAngles.current.lift = THREE.MathUtils.damp(currentAngles.current.lift, targetLift, speed, delta)
    currentAngles.current.elbow = THREE.MathUtils.damp(currentAngles.current.elbow, targetElbow, speed, delta)
    currentAngles.current.wrist = THREE.MathUtils.damp(currentAngles.current.wrist, targetWrist, speed, delta)
    currentAngles.current.roll = THREE.MathUtils.damp(currentAngles.current.roll, targetRoll, speed, delta)
    currentAngles.current.gripper = THREE.MathUtils.damp(currentAngles.current.gripper, targetGripper, speed * 2, delta)

    // تطبيق الدوران على المفاصل
    if (shoulderPanRef.current) shoulderPanRef.current.rotation.y = currentAngles.current.pan
    if (shoulderLiftRef.current) shoulderLiftRef.current.rotation.z = currentAngles.current.lift
    if (elbowRef.current) elbowRef.current.rotation.z = currentAngles.current.elbow
    if (wristPitchRef.current) wristPitchRef.current.rotation.z = currentAngles.current.wrist
    if (wristRollRef.current) wristRollRef.current.rotation.y = currentAngles.current.roll

    // فتح وإغلاق أصابع القابض (Gripper)
    if (gripperLeftRef.current) gripperLeftRef.current.position.x = -currentAngles.current.gripper / 2
    if (gripperRightRef.current) gripperRightRef.current.position.x = currentAngles.current.gripper / 2

    // تحريك الصندوق المستهدف فيزيائياً
    if (blockRef.current) {
      if (isCameraMode) {
        if (eeMarkerRef.current) {
          const eePos = new THREE.Vector3()
          eeMarkerRef.current.getWorldPosition(eePos)
          const distToBlock = eePos.distanceTo(blockRef.current.position)

          // إذا كانت يد المستخدم تضم الأصابع والقابض قريب من الصندوق يتم التقاطه
          if (handPose && handPose.isGrasping && (isHoldingBlock.current || distToBlock < 0.38)) {
            isHoldingBlock.current = true
            blockRef.current.position.set(eePos.x, eePos.y - 0.1, eePos.z)
          } else {
            isHoldingBlock.current = false
            // سقوط الصندوق على الطاولة بفعل الجاذبية
            if (blockRef.current.position.y > 0.18) {
              blockRef.current.position.y = THREE.MathUtils.damp(blockRef.current.position.y, 0.18, 12, delta)
            }
          }
        }
      } else {
        if (currentStep >= 2 && currentStep <= 4) {
          if (eeMarkerRef.current) {
            const worldPos = new THREE.Vector3()
            eeMarkerRef.current.getWorldPosition(worldPos)
            blockRef.current.position.copy(worldPos)
            blockRef.current.position.y -= 0.12
          }
        } else if (currentStep >= 5) {
          blockRef.current.position.set(-1.2, 0.18, 0.9)
        } else {
          blockRef.current.position.set(1.2, 0.18, 0.9)
        }
      }
    }
  })

  return (
    <group position={position}>
      {/* ─── إضاءة استوديو متقدمة ────────────────────────────────────────── */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 8, 5]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[-4, 4, -3]} intensity={0.8} color="#4488ff" />
      <pointLight position={[3, 2, 4]} intensity={0.6} color="#00ff88" />

      {/* ─── أرضية المختبر وطاولة العمل ──────────────────────────────────── */}
      {/* طاولة الروبوت الصناعية */}
      <mesh position={[0, -0.05, 0.6]} receiveShadow>
        <boxGeometry args={[4.2, 0.1, 2.6]} />
        <meshStandardMaterial color="#1a1c24" roughness={0.4} metalness={0.8} />
      </mesh>
      {/* سطح الطاولة المعدني المنقوش */}
      <mesh position={[0, 0.005, 0.6]} receiveShadow>
        <boxGeometry args={[4.0, 0.01, 2.4]} />
        <meshStandardMaterial color="#232632" roughness={0.2} metalness={0.9} />
      </mesh>
      {/* شبكة القياسات (Grid) */}
      <gridHelper args={[4, 20, '#00ff88', '#2a3142']} position={[0, 0.012, 0.6]} />

      {/* ─── منطقة الالتقاط (Pick Zone) ─────────────────────────────────── */}
      <group position={[1.2, 0.015, 0.9]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.25, 32]} />
          <meshBasicMaterial color="#00e5ff" side={THREE.DoubleSide} />
        </mesh>
        <Html position={[0, 0.05, 0]} center>
          <div style={{ color: '#00e5ff', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            PICK ZONE
          </div>
        </Html>
      </group>

      {/* ─── منطقة الإسقاط (Place Zone) ─────────────────────────────────── */}
      <group position={[-1.2, 0.015, 0.9]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.2, 0.25, 32]} />
          <meshBasicMaterial color="#ffaa00" side={THREE.DoubleSide} />
        </mesh>
        <Html position={[0, 0.05, 0]} center>
          <div style={{ color: '#ffaa00', fontSize: '10px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            PLACE TARGET
          </div>
        </Html>
      </group>

      {/* ─── العائق (إذا كانت المهمة تتطلب تفادي عائق) ─────────────────── */}
      {task === 'obstacle' && (
        <group position={[0, 0.45, 0.9]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.4, 0.8, 0.4]} />
            <meshStandardMaterial color="#ff3366" roughness={0.3} metalness={0.7} transparent opacity={0.85} />
          </mesh>
          <Html position={[0, 0.5, 0]} center>
            <div style={{ background: 'rgba(255,51,102,0.85)', padding: '2px 6px', borderRadius: '4px', color: '#fff', fontSize: '9px', fontWeight: 'bold' }}>
              ⚠️ OBSTACLE
            </div>
          </Html>
        </group>
      )}

      {/* ─── المجسم المراد نقله (Target Block) ─────────────────────────── */}
      <mesh ref={blockRef} position={[1.2, 0.18, 0.9]} castShadow receiveShadow>
        <boxGeometry args={[0.18, 0.18, 0.18]} />
        <meshStandardMaterial
          color={currentStep >= 2 && currentStep <= 5 ? '#00ff88' : '#00c3ff'}
          roughness={0.2}
          metalness={0.4}
          emissive={currentStep >= 2 && currentStep <= 5 ? '#00aa55' : '#004488'}
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* ─── مؤشر الموضع المستهدف ليد المستخدم (3D Hand Target Indicator) ─── */}
      {isCameraMode && handPose && (
        <group position={[
          THREE.MathUtils.clamp((0.5 - handPose.x) * 2.6, -1.5, 1.5),
          THREE.MathUtils.clamp(0.24 + (0.85 - handPose.y) * 1.6, 0.22, 1.85),
          THREE.MathUtils.clamp(0.95 + (handPose.z || 0) * 1.4, 0.65, 1.35)
        ]}>
          <mesh>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshStandardMaterial
              color={handPose.isGrasping ? '#ff3366' : '#00ff88'}
              emissive={handPose.isGrasping ? '#ff3366' : '#00ff88'}
              emissiveIntensity={1.0}
            />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.08, 0.1, 32]} />
            <meshBasicMaterial color={handPose.isGrasping ? '#ff3366' : '#00e5ff'} side={THREE.DoubleSide} />
          </mesh>
          <Html position={[0, 0.12, 0]} center>
            <div style={{
              background: handPose.isGrasping ? 'rgba(255, 51, 102, 0.85)' : 'rgba(0, 229, 255, 0.85)',
              color: '#000',
              fontSize: '8px',
              fontWeight: 'bold',
              padding: '1px 5px',
              borderRadius: '3px',
              whiteSpace: 'nowrap'
            }}>
              {handPose.isGrasping ? 'GRASP ACTIVE' : 'TARGET IK'}
            </div>
          </Html>
        </group>
      )}

      {/* ─── مسار الحركة ثلاثي الأبعاد المخطط له (End-Effector Trajectory) ── */}
      <primitive object={new THREE.Line(trajectoryGeometry, new THREE.LineDashedMaterial({
        color: '#00ffaa',
        dashSize: 0.1,
        gapSize: 0.05,
        linewidth: 2,
      }))} />

      {/* ─── هيكل الروبوت الحركي (Robotic Arm Assembly) ─────────────────── */}
      {/* قاعدة الروبوت الثابتة (Base Pedestal) */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 0.1, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.35, 0.2, 32]} />
          <meshStandardMaterial color={jointColor} roughness={0.3} metalness={0.8} />
        </mesh>
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.22, 0.25, 0.1, 32]} />
          <meshStandardMaterial color={linkColor} roughness={0.2} metalness={0.5} />
        </mesh>

        {/* المفصل 1: دوران حول المحور الرأسي (Shoulder Pan) */}
        <group ref={shoulderPanRef} position={[0, 0.3, 0]}>
          <mesh position={[0, 0.12, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.2, 0.24, 32]} />
            <meshStandardMaterial color={jointColor} roughness={0.3} metalness={0.8} />
          </mesh>

          {/* المفصل 2: رفع الكتف (Shoulder Lift) */}
          <group ref={shoulderLiftRef} position={[0, 0.24, 0]}>
            {/* أسطوانة المفصل العرضية */}
            <mesh rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.32, 24]} />
              <meshStandardMaterial color={accentColor} roughness={0.2} metalness={0.8} />
            </mesh>

            {/* الذراع العلوي الرئيسي (Upper Arm Link) */}
            <group position={[0, 0.55, 0]}>
              <mesh position={[0, 0, 0]} castShadow>
                <cylinderGeometry args={[0.12, 0.14, 1.1, 24]} />
                <meshStandardMaterial color={linkColor} roughness={0.2} metalness={0.4} />
              </mesh>
              {/* شريط زينة جمالي يحمل اسم الروبوت */}
              <Html position={[0.16, 0, 0]} center>
                <div style={{ color: '#8899aa', fontSize: '9px', fontWeight: 'bold', transform: 'rotate(-90deg)' }}>
                  {isFranka ? 'PANDA 7-DoF' : 'UR5e 6-DoF'}
                </div>
              </Html>

              {/* المفصل 3: الكوع (Elbow Joint) */}
              <group ref={elbowRef} position={[0, 0.55, 0]}>
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.13, 0.13, 0.28, 24]} />
                  <meshStandardMaterial color={jointColor} roughness={0.3} metalness={0.8} />
                </mesh>

                {/* الساعد (Forearm Link) */}
                <group position={[0, 0.45, 0]}>
                  <mesh castShadow>
                    <cylinderGeometry args={[0.09, 0.11, 0.9, 24]} />
                    <meshStandardMaterial color={linkColor} roughness={0.2} metalness={0.4} />
                  </mesh>

                  {/* المفصل 4 & 5: المعصم (Wrist Pitch) */}
                  <group ref={wristPitchRef} position={[0, 0.45, 0]}>
                    <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                      <cylinderGeometry args={[0.08, 0.08, 0.22, 20]} />
                      <meshStandardMaterial color={accentColor} roughness={0.2} metalness={0.8} />
                    </mesh>

                    {/* المفصل 6: دوران المعصم النهائي (Wrist Roll) */}
                    <group ref={wristRollRef} position={[0, 0.1, 0]}>
                      <mesh castShadow>
                        <cylinderGeometry args={[0.07, 0.08, 0.16, 20]} />
                        <meshStandardMaterial color={jointColor} roughness={0.3} metalness={0.8} />
                      </mesh>

                      {/* ─── القابض (Parallel End-Effector Gripper) ──────────── */}
                      <group position={[0, 0.14, 0]}>
                        {/* قاعدة القابض */}
                        <mesh castShadow>
                          <boxGeometry args={[0.22, 0.08, 0.1]} />
                          <meshStandardMaterial color="#1a1c22" roughness={0.3} metalness={0.8} />
                        </mesh>

                        {/* مؤشر موقع طرف الروبوت End-Effector Marker */}
                        <group ref={eeMarkerRef} position={[0, 0.12, 0]} />

                        {/* الإصبع الأيسر (Left Finger) */}
                        <mesh ref={gripperLeftRef} position={[-0.07, 0.08, 0]} castShadow>
                          <boxGeometry args={[0.025, 0.16, 0.05]} />
                          <meshStandardMaterial color="#3a88ff" roughness={0.2} metalness={0.7} />
                        </mesh>

                        {/* الإصبع الأيمن (Right Finger) */}
                        <mesh ref={gripperRightRef} position={[0.07, 0.08, 0]} castShadow>
                          <boxGeometry args={[0.025, 0.16, 0.05]} />
                          <meshStandardMaterial color="#3a88ff" roughness={0.2} metalness={0.7} />
                        </mesh>
                      </group>
                    </group>
                  </group>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
}
