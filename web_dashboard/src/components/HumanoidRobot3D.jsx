import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

/**
 * روبوت بشري حقيقي ثلاثي الأبعاد (Full Humanoid Robot)
 * هيكل ميكانيكي حقيقي متكامل: رأس بمستشعرات، جذع صناعي مصفح، ذراعان مفصليتان، أيدي قابضة، حوض وأرجل هيدروليكية
 * يتحرك في الوقت الفعلي مع حركة جسم المستخدم ويديه الملتقطة من الكاميرا
 */
export default function HumanoidRobot3D({
  poseData = null,
  isCameraActive = false,
  position = [0, -1.0, 0],
  replayPose = null
}) {
  // مراجع أجزاء جسم الروبوت الحقيقي
  const rootGroup = useRef()
  const headRef = useRef()
  const neckRef = useRef()
  const torsoRef = useRef()
  const chestRef = useRef()

  // الذراع الأيمن
  const rShoulderRef = useRef()
  const rUpperArmRef = useRef()
  const rElbowRef = useRef()
  const rForearmRef = useRef()
  const rWristRef = useRef()
  const rHandRef = useRef()
  const rFinger1Ref = useRef()
  const rFinger2Ref = useRef()

  // الذراع الأيسر
  const lShoulderRef = useRef()
  const lUpperArmRef = useRef()
  const lElbowRef = useRef()
  const lForearmRef = useRef()
  const lWristRef = useRef()
  const lHandRef = useRef()
  const lFinger1Ref = useRef()
  const lFinger2Ref = useRef()

  // الأرجل والقاعدة
  const pelvisRef = useRef()
  const rHipRef = useRef()
  const rKneeRef = useRef()
  const lHipRef = useRef()
  const lKneeRef = useRef()

  // كائن مستهدف للإمساك به
  const targetCubeRef = useRef()

  // الحالة الحركية المنعمة للمفاصل
  const currentPose = useRef({
    torsoRotY: 0,
    torsoRotX: 0,
    headPitch: 0,
    headYaw: 0,
    rShoulderPitch: 0.1,
    rShoulderRoll: -0.3,
    rElbow: 0.5,
    rHandGrip: 0.08,
    lShoulderPitch: 0.1,
    lShoulderRoll: 0.3,
    lElbow: 0.5,
    lHandGrip: 0.08,
    crouchY: 0
  })

  // ألوان ونمط المواد للروبوت الصناعي (Titanium White + Carbon Black + Cyan Glow)
  const armorMaterial = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.25,
    metalness: 0.75,
  })

  const chassisMaterial = new THREE.MeshStandardMaterial({
    color: '#1a202c',
    roughness: 0.4,
    metalness: 0.85,
  })

  const jointMaterial = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.2,
    metalness: 0.9,
  })

  const glowCyan = new THREE.MeshStandardMaterial({
    color: '#00e5ff',
    emissive: '#00e5ff',
    emissiveIntensity: 0.9,
    roughness: 0.1,
  })

  const glowAmber = new THREE.MeshStandardMaterial({
    color: '#ff9900',
    emissive: '#ff9900',
    emissiveIntensity: 0.8,
  })

  // تحديث الحركات في كل إطار 60 FPS
  useFrame((state, delta) => {
    let target = {
      torsoRotY: 0,
      torsoRotX: 0,
      headPitch: 0,
      headYaw: 0,
      rShoulderPitch: 0.1,
      rShoulderRoll: -0.2,
      rElbow: 0.4,
      rHandGrip: 0.08,
      lShoulderPitch: 0.1,
      lShoulderRoll: 0.2,
      lElbow: 0.4,
      lHandGrip: 0.08,
      crouchY: 0
    }

    // إذا كانت الكاميرا نشطة وتم رصد نقاط جسم حقيقية للمستخدم
    if (isCameraActive && poseData && poseData.isDetected && poseData.landmarks) {
      const lm = poseData.landmarks

      // 1. حركة الرأس التفاعلية (Head Tracking) - ينظر الروبوت باتجاه وجه المستخدم
      if (lm[0] && lm[11] && lm[12]) {
        const neckX = (lm[11].x + lm[12].x) / 2
        const neckY = (lm[11].y + lm[12].y) / 2
        target.headYaw = THREE.MathUtils.clamp((neckX - lm[0].x) * 2.2, -0.7, 0.7)
        target.headPitch = THREE.MathUtils.clamp((lm[0].y - neckY + 0.18) * 2.0, -0.5, 0.5)
      }

      // ─── 2. حركة الذراعين بنظام المرآة الطبيعي مع ضمان عدم اختراق الصدر ───
      const userRightShoulder = lm[12]
      const userRightWrist = lm[16]
      const userRightHip = lm[24]

      const isScreenRightActive = userRightShoulder && userRightWrist &&
        (userRightWrist.y < (userRightHip?.y || 0.75) - 0.04 || Math.abs((1.0 - userRightWrist.x) - (1.0 - userRightShoulder.x)) > 0.08)

      if (isScreenRightActive) {
        const dx = (1.0 - userRightWrist.x) - (1.0 - userRightShoulder.x)
        const vx = dx * 1.5
        const vy = (userRightShoulder.y - userRightWrist.y) * 1.5 // موجب للأعلى

        // مسافة أمان أمامية صارمة: كلما ارتفعت اليد (vy > 0)، تندفع للأمام في الفضاء (Z >= 0.32m) لمنع لمس الصدر/الوجه
        const baseZ = Math.max(0.26, 0.22 + Math.max(0, vy) * 0.45)
        const vz = THREE.MathUtils.clamp(((userRightShoulder.z || 0) - (userRightWrist.z || 0)) * 2.2 + baseZ, 0.24, 0.75)

        const dist = Math.hypot(vx, vy, vz)
        const L1 = 0.35
        const L2 = 0.35
        const clampedD = THREE.MathUtils.clamp(dist, 0.22, (L1 + L2) - 0.02)

        const cosElbow = (L1 * L1 + L2 * L2 - clampedD * clampedD) / (2 * L1 * L2)
        target.rElbow = THREE.MathUtils.clamp(Math.PI - Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1)), 0.1, 2.2)

        const rawRoll = -Math.atan2(vx, Math.max(0.08, -vy))
        target.rShoulderRoll = THREE.MathUtils.clamp(rawRoll, -2.2, -0.22)

        // زاوية رفع الكتف للأمام (Pitch): ترفع العضد للأمام والأعلى حتى يخرج الكوع والساعد أمام الصدر
        const forwardAngle = Math.atan2(vz, -vy) // زاوية الاندفاع للأمام
        target.rShoulderPitch = THREE.MathUtils.clamp(forwardAngle, 0.15, 1.8)

        target.rHandGrip = (poseData.rightHand && poseData.rightHand.isGrasping) ? 0.02 : 0.09
      } else {
        target.rShoulderRoll = -0.25
        target.rShoulderPitch = 0.10
        target.rElbow = 0.35
        target.rHandGrip = 0.08
      }

      // الذراع الأيسر
      const userLeftShoulder = lm[11]
      const userLeftWrist = lm[15]
      const userLeftHip = lm[23]

      const isScreenLeftActive = userLeftShoulder && userLeftWrist &&
        (userLeftWrist.y < (userLeftHip?.y || 0.75) - 0.04 || Math.abs((1.0 - userLeftWrist.x) - (1.0 - userLeftShoulder.x)) > 0.08)

      if (isScreenLeftActive) {
        const dx = (1.0 - userLeftWrist.x) - (1.0 - userLeftShoulder.x)
        const vx = dx * 1.5
        const vy = (userLeftShoulder.y - userLeftWrist.y) * 1.5

        const baseZ = Math.max(0.26, 0.22 + Math.max(0, vy) * 0.45)
        const vz = THREE.MathUtils.clamp(((userLeftShoulder.z || 0) - (userLeftWrist.z || 0)) * 2.2 + baseZ, 0.24, 0.75)

        const dist = Math.hypot(vx, vy, vz)
        const L1 = 0.35
        const L2 = 0.35
        const clampedD = THREE.MathUtils.clamp(dist, 0.22, (L1 + L2) - 0.02)

        const cosElbow = (L1 * L1 + L2 * L2 - clampedD * clampedD) / (2 * L1 * L2)
        target.lElbow = THREE.MathUtils.clamp(Math.PI - Math.acos(THREE.MathUtils.clamp(cosElbow, -1, 1)), 0.1, 2.2)

        const rawRoll = Math.atan2(-vx, Math.max(0.08, -vy))
        target.lShoulderRoll = THREE.MathUtils.clamp(rawRoll, 0.22, 2.2)

        const forwardAngle = Math.atan2(vz, -vy)
        target.lShoulderPitch = THREE.MathUtils.clamp(forwardAngle, 0.15, 1.8)
      } else {
        target.lShoulderRoll = 0.25
        target.lShoulderPitch = 0.10
        target.lElbow = 0.35
      }

      target.torsoRotY = 0
      target.torsoRotX = 0
    } else if (replayPose) {
      // تطبيق الوضعية المسجلة من مهارة معينة تم استخلاصها مع تطبيق حدود الأمان الفيزيائية
      if (replayPose.rArmAngles) {
        // فرض خلوص الكتف للخارج وفرض زاوية رفع آمنة تمنع انغراس اليد بالصدر
        const rRoll = replayPose.rArmAngles.roll || -0.25
        target.rShoulderRoll = THREE.MathUtils.clamp(rRoll < 0 ? rRoll : -rRoll, -2.2, -0.22)
        target.rShoulderPitch = THREE.MathUtils.clamp(Math.max(0.25, replayPose.rArmAngles.pitch || 0.3), 0.15, 1.8)
        target.rElbow = THREE.MathUtils.clamp(replayPose.rArmAngles.elbow || 0.4, 0.1, 2.1)
      }
      if (replayPose.lArmAngles) {
        const lRoll = replayPose.lArmAngles.roll || 0.25
        target.lShoulderRoll = THREE.MathUtils.clamp(lRoll > 0 ? lRoll : -lRoll, 0.22, 2.2)
        target.lShoulderPitch = THREE.MathUtils.clamp(Math.max(0.25, replayPose.lArmAngles.pitch || 0.3), 0.15, 1.8)
        target.lElbow = THREE.MathUtils.clamp(replayPose.lArmAngles.elbow || 0.4, 0.1, 2.1)
      }
      if (replayPose.rHandGrip !== undefined) target.rHandGrip = replayPose.rHandGrip
      if (replayPose.headYaw !== undefined) target.headYaw = replayPose.headYaw
      if (replayPose.torsoRotY !== undefined) target.torsoRotY = replayPose.torsoRotY
    } else {
      // حركات حيوية طبيعية أثناء الخمول (Breathing & Subtle Motion)
      const t = state.clock.elapsedTime
      target.headYaw = Math.sin(t * 0.8) * 0.08
      target.torsoRotX = Math.sin(t * 1.5) * 0.02
      target.rShoulderRoll = -0.2 + Math.sin(t * 1.2) * 0.05
      target.lShoulderRoll = 0.2 - Math.sin(t * 1.2) * 0.05
      target.rElbow = 0.35 + Math.cos(t) * 0.05
      target.lElbow = 0.35 - Math.cos(t) * 0.05
    }

    const cur = currentPose.current
    const lerpSpeed = 9.0

    cur.torsoRotY = THREE.MathUtils.damp(cur.torsoRotY, target.torsoRotY, lerpSpeed, delta)
    cur.torsoRotX = THREE.MathUtils.damp(cur.torsoRotX, target.torsoRotX, lerpSpeed, delta)
    cur.headPitch = THREE.MathUtils.damp(cur.headPitch, target.headPitch, lerpSpeed, delta)
    cur.headYaw = THREE.MathUtils.damp(cur.headYaw, target.headYaw, lerpSpeed, delta)
    cur.rShoulderPitch = THREE.MathUtils.damp(cur.rShoulderPitch, target.rShoulderPitch, lerpSpeed, delta)
    cur.rShoulderRoll = THREE.MathUtils.damp(cur.rShoulderRoll, target.rShoulderRoll, lerpSpeed, delta)
    cur.rElbow = THREE.MathUtils.damp(cur.rElbow, target.rElbow, lerpSpeed, delta)
    cur.rHandGrip = THREE.MathUtils.damp(cur.rHandGrip, target.rHandGrip, 14, delta)
    cur.lShoulderPitch = THREE.MathUtils.damp(cur.lShoulderPitch, target.lShoulderPitch, lerpSpeed, delta)
    cur.lShoulderRoll = THREE.MathUtils.damp(cur.lShoulderRoll, target.lShoulderRoll, lerpSpeed, delta)
    cur.lElbow = THREE.MathUtils.damp(cur.lElbow, target.lElbow, lerpSpeed, delta)
    cur.crouchY = THREE.MathUtils.damp(cur.crouchY, target.crouchY, lerpSpeed, delta)

    // تطبيق الدوران والتحويلات على مفاصل الروبوت
    if (torsoRef.current) {
      torsoRef.current.position.y = 1.05 + cur.crouchY
      torsoRef.current.rotation.y = cur.torsoRotY
      torsoRef.current.rotation.x = cur.torsoRotX
    }

    if (headRef.current) {
      headRef.current.rotation.y = cur.headYaw
      headRef.current.rotation.x = cur.headPitch
    }

    // مفاصل الذراع الأيمن
    if (rShoulderRef.current) {
      rShoulderRef.current.rotation.z = cur.rShoulderRoll
      rShoulderRef.current.rotation.x = -cur.rShoulderPitch
    }
    if (rElbowRef.current) {
      rElbowRef.current.rotation.x = -cur.rElbow
    }
    if (rFinger1Ref.current && rFinger2Ref.current) {
      rFinger1Ref.current.position.x = -cur.rHandGrip
      rFinger2Ref.current.position.x = cur.rHandGrip
    }

    // مفاصل الذراع الأيسر
    if (lShoulderRef.current) {
      lShoulderRef.current.rotation.z = cur.lShoulderRoll
      lShoulderRef.current.rotation.x = -cur.lShoulderPitch
    }
    if (lElbowRef.current) {
      lElbowRef.current.rotation.x = -cur.lElbow
    }
  })

  return (
    <group ref={rootGroup} position={position}>
      {/* ─── أرضية المختبر الدائرية المضيئة ─────────────────────────────── */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.75, 48]} />
        <meshBasicMaterial color="#00e5ff" side={THREE.DoubleSide} transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 48]} />
        <meshStandardMaterial color="#0d111a" roughness={0.3} metalness={0.9} />
      </mesh>

      {/* ─── الحوض والقاعدة السفلية (Pelvis & Base) ────────────────────────── */}
      <group ref={pelvisRef} position={[0, 0.9, 0]}>
        <mesh castShadow receiveShadow material={chassisMaterial}>
          <boxGeometry args={[0.38, 0.16, 0.24]} />
        </mesh>
        <mesh position={[0, 0, 0.125]} material={glowCyan}>
          <boxGeometry args={[0.2, 0.03, 0.01]} />
        </mesh>
      </group>

      {/* ─── الساقان الميكانيكيتان (Mechanical Legs) ──────────────────────── */}
      {/* الساق اليمنى */}
      <group position={[0.13, 0.85, 0]}>
        {/* مفصل الفخذ */}
        <mesh castShadow material={jointMaterial}>
          <sphereGeometry args={[0.07, 16, 16]} />
        </mesh>
        {/* الفخذ */}
        <mesh position={[0, -0.22, 0]} castShadow material={armorMaterial}>
          <boxGeometry args={[0.11, 0.38, 0.13]} />
        </mesh>
        {/* الركبة */}
        <mesh position={[0, -0.42, 0]} castShadow material={jointMaterial}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 16]} rotation={[0, 0, Math.PI / 2]} />
        </mesh>
        {/* الساق السفلية */}
        <mesh position={[0, -0.64, 0]} castShadow material={armorMaterial}>
          <boxGeometry args={[0.09, 0.38, 0.11]} />
        </mesh>
        {/* القدم */}
        <mesh position={[0, -0.85, 0.05]} castShadow material={chassisMaterial}>
          <boxGeometry args={[0.12, 0.06, 0.22]} />
        </mesh>
      </group>

      {/* الساق اليسرى */}
      <group position={[-0.13, 0.85, 0]}>
        <mesh castShadow material={jointMaterial}>
          <sphereGeometry args={[0.07, 16, 16]} />
        </mesh>
        <mesh position={[0, -0.22, 0]} castShadow material={armorMaterial}>
          <boxGeometry args={[0.11, 0.38, 0.13]} />
        </mesh>
        <mesh position={[0, -0.42, 0]} castShadow material={jointMaterial}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 16]} rotation={[0, 0, Math.PI / 2]} />
        </mesh>
        <mesh position={[0, -0.64, 0]} castShadow material={armorMaterial}>
          <boxGeometry args={[0.09, 0.38, 0.11]} />
        </mesh>
        <mesh position={[0, -0.85, 0.05]} castShadow material={chassisMaterial}>
          <boxGeometry args={[0.12, 0.06, 0.22]} />
        </mesh>
      </group>

      {/* ─── الجذع الرئيسي المصفح (Armored Upper Torso) ──────────────────── */}
      <group ref={torsoRef} position={[0, 1.05, 0]}>
        {/* عمود فقري ميكانيكي هيدروليكي */}
        <mesh position={[0, 0.1, 0]} castShadow material={jointMaterial}>
          <cylinderGeometry args={[0.1, 0.12, 0.22, 16]} />
        </mesh>

        {/* درع الصدر الرئيسي (Main Chest Plate) */}
        <group ref={chestRef} position={[0, 0.32, 0]}>
          <mesh castShadow receiveShadow material={armorMaterial}>
            <boxGeometry args={[0.46, 0.42, 0.28]} />
          </mesh>

          {/* مفاعل الطاقة الدائري في منتصف الصدر (Glowing Core Reactor) */}
          <mesh position={[0, 0.04, 0.145]} material={glowCyan}>
            <cylinderGeometry args={[0.065, 0.065, 0.02, 32]} rotation={[Math.PI / 2, 0, 0]} />
          </mesh>
          <mesh position={[0, 0.04, 0.155]}>
            <ringGeometry args={[0.07, 0.085, 32]} />
            <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
          </mesh>

          {/* خطوط تيتانيوم جانبية */}
          <mesh position={[0.16, -0.06, 0.142]} material={chassisMaterial}>
            <boxGeometry args={[0.06, 0.18, 0.01]} />
          </mesh>
          <mesh position={[-0.16, -0.06, 0.142]} material={chassisMaterial}>
            <boxGeometry args={[0.06, 0.18, 0.01]} />
          </mesh>

          {/* ─── الرأس والمستشعرات البصرية (Head & Vision Visor) ────────── */}
          <group position={[0, 0.26, 0]}>
            {/* العنق */}
            <mesh castShadow material={jointMaterial}>
              <cylinderGeometry args={[0.07, 0.08, 0.1, 16]} />
            </mesh>

            {/* الرأس */}
            <group ref={headRef} position={[0, 0.15, 0]}>
              {/* خوذة الرأس المعدنية */}
              <mesh castShadow material={armorMaterial}>
                <boxGeometry args={[0.24, 0.22, 0.24]} />
              </mesh>
              <mesh position={[0, 0.06, -0.04]} castShadow material={chassisMaterial}>
                <boxGeometry args={[0.26, 0.14, 0.22]} />
              </mesh>

              {/* قناع الرؤية الليزري (Cyberpunk Vision Visor) */}
              <mesh position={[0, 0.01, 0.122]} material={glowCyan}>
                <boxGeometry args={[0.21, 0.055, 0.02]} />
              </mesh>
              {/* كاميرات استشعار العمق (Stereo Depth Cameras) */}
              <mesh position={[0.06, 0.01, 0.133]} material={glowAmber}>
                <circleGeometry args={[0.015, 16]} />
              </mesh>
              <mesh position={[-0.06, 0.01, 0.133]} material={glowAmber}>
                <circleGeometry args={[0.015, 16]} />
              </mesh>

              {/* شارة فوق الرأس */}
              <Html position={[0, 0.24, 0]} center>
                <div style={{
                  background: 'rgba(0, 229, 255, 0.2)',
                  border: '1px solid #00e5ff',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  color: '#00e5ff',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  letterSpacing: '1px'
                }}>
                  POSE2SKILL HUMANOID
                </div>
              </Html>
            </group>
          </group>

          {/* ─── الذراع الأيمن المتكامل (Right Articulated Arm) ────────────── */}
          <group position={[0.34, 0.14, 0]}>
            {/* طوق التثبيت العريض لتجنب تداخل الذراع مع الصدر */}
            <mesh position={[-0.055, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={chassisMaterial}>
              <cylinderGeometry args={[0.05, 0.05, 0.11, 16]} />
            </mesh>
            {/* مفصل الكتف كروي */}
            <mesh castShadow material={jointMaterial}>
              <sphereGeometry args={[0.08, 20, 20]} />
            </mesh>

            <group ref={rShoulderRef}>
              {/* العضد */}
              <mesh position={[0, -0.18, 0]} castShadow material={armorMaterial}>
                <cylinderGeometry args={[0.06, 0.07, 0.32, 16]} />
              </mesh>

              {/* مفصل الكوع */}
              <group ref={rElbowRef} position={[0, -0.34, 0]}>
                <mesh castShadow material={jointMaterial}>
                  <cylinderGeometry args={[0.055, 0.055, 0.14, 16]} rotation={[0, 0, Math.PI / 2]} />
                </mesh>

                {/* الساعد */}
                <group position={[0, -0.18, 0]}>
                  <mesh castShadow material={armorMaterial}>
                    <cylinderGeometry args={[0.05, 0.058, 0.3, 16]} />
                  </mesh>

                  {/* المعصم واليد القابضة (Mechanical Hand Gripper) */}
                  <group position={[0, -0.18, 0]}>
                    <mesh castShadow material={jointMaterial}>
                      <boxGeometry args={[0.09, 0.05, 0.07]} />
                    </mesh>

                    {/* أصابع اليد اليمنى */}
                    <mesh ref={rFinger1Ref} position={[-0.04, -0.06, 0]} castShadow material={glowCyan}>
                      <boxGeometry args={[0.015, 0.1, 0.03]} />
                    </mesh>
                    <mesh ref={rFinger2Ref} position={[0.04, -0.06, 0]} castShadow material={glowCyan}>
                      <boxGeometry args={[0.015, 0.1, 0.03]} />
                    </mesh>
                  </group>
                </group>
              </group>
            </group>
          </group>

          {/* ─── الذراع الأيسر المتكامل (Left Articulated Arm) ─────────────── */}
          <group position={[-0.34, 0.14, 0]}>
            {/* طوق التثبيت العريض لتجنب تداخل الذراع مع الصدر */}
            <mesh position={[0.055, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={chassisMaterial}>
              <cylinderGeometry args={[0.05, 0.05, 0.11, 16]} />
            </mesh>
            <mesh castShadow material={jointMaterial}>
              <sphereGeometry args={[0.08, 20, 20]} />
            </mesh>

            <group ref={lShoulderRef}>
              <mesh position={[0, -0.18, 0]} castShadow material={armorMaterial}>
                <cylinderGeometry args={[0.06, 0.07, 0.32, 16]} />
              </mesh>

              <group ref={lElbowRef} position={[0, -0.34, 0]}>
                <mesh castShadow material={jointMaterial}>
                  <cylinderGeometry args={[0.055, 0.055, 0.14, 16]} rotation={[0, 0, Math.PI / 2]} />
                </mesh>

                <group position={[0, -0.18, 0]}>
                  <mesh castShadow material={armorMaterial}>
                    <cylinderGeometry args={[0.05, 0.058, 0.3, 16]} />
                  </mesh>

                  <group position={[0, -0.18, 0]}>
                    <mesh castShadow material={jointMaterial}>
                      <boxGeometry args={[0.09, 0.05, 0.07]} />
                    </mesh>

                    <mesh position={[-0.03, -0.06, 0]} castShadow material={glowCyan}>
                      <boxGeometry args={[0.015, 0.1, 0.03]} />
                    </mesh>
                    <mesh position={[0.03, -0.06, 0]} castShadow material={glowCyan}>
                      <boxGeometry args={[0.015, 0.1, 0.03]} />
                    </mesh>
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
