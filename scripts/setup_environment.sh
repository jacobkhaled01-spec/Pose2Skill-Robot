#!/bin/bash
# =============================================================================
# سكريبت إعداد بيئة مشروع Pose2Skill-Robot
# Setup Script for Pose2Skill-Robot on Ubuntu 22.04
# =============================================================================
# الاستخدام: bash scripts/setup_environment.sh
# =============================================================================

set -e  # توقف عند أي خطأ

echo "╔══════════════════════════════════════════════════════════╗"
echo "║     Pose2Skill-Robot — Environment Setup Script         ║"
echo "║     إعداد بيئة مشروع Pose2Skill-Robot                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── التحقق من نظام التشغيل ──────────────────────────────────
check_ubuntu() {
    if ! grep -q "Ubuntu 22.04" /etc/os-release 2>/dev/null; then
        echo "⚠️  تحذير: هذا السكريبت مُصمَّم لـ Ubuntu 22.04"
        echo "   قد لا يعمل بشكل صحيح على أنظمة أخرى"
        read -p "   هل تريد الاستمرار؟ [y/N]: " confirm
        [[ "$confirm" != "y" ]] && exit 1
    fi
    echo "✅ Ubuntu 22.04 LTS مكتشف"
}

# ─── تثبيت ROS 2 Humble ──────────────────────────────────────
install_ros2() {
    echo ""
    echo "📦 [1/7] تثبيت ROS 2 Humble..."
    
    if command -v ros2 &>/dev/null; then
        echo "✅ ROS 2 مثبت بالفعل"
        return
    fi
    
    sudo apt update && sudo apt install -y curl gnupg lsb-release
    curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.key \
        -o /usr/share/keyrings/ros-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] \
        http://packages.ros.org/ros2/ubuntu $(lsb_release -cs) main" \
        | sudo tee /etc/apt/sources.list.d/ros2.list
    sudo apt update
    sudo apt install -y ros-humble-desktop ros-humble-dev-tools
    
    echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
    source /opt/ros/humble/setup.bash
    echo "✅ ROS 2 Humble مثبت"
}

# ─── تثبيت MoveIt 2 ──────────────────────────────────────────
install_moveit() {
    echo ""
    echo "📦 [2/7] تثبيت MoveIt 2..."
    
    sudo apt install -y \
        ros-humble-moveit \
        ros-humble-moveit-visual-tools \
        ros-humble-moveit-ros-planning-interface \
        ros-humble-bio-ik-kinematics-plugin
    
    echo "✅ MoveIt 2 مثبت"
}

# ─── تثبيت Gazebo Harmonic ───────────────────────────────────
install_gazebo() {
    echo ""
    echo "📦 [3/7] تثبيت Gazebo Harmonic..."
    
    sudo apt-get update
    sudo apt-get install -y gz-harmonic ros-humble-ros-gz
    
    echo "✅ Gazebo Harmonic مثبت"
}

# ─── تثبيت نماذج الروبوتات ───────────────────────────────────
install_robot_descriptions() {
    echo ""
    echo "📦 [4/7] تثبيت نماذج Franka Panda و UR5e..."
    
    sudo apt install -y \
        ros-humble-franka-description \
        ros-humble-franka-bringup \
        ros-humble-ur-description \
        ros-humble-ur-moveit-config \
        ros-humble-rosbridge-suite
    
    echo "✅ نماذج الروبوتات مثبتة"
}

# ─── تثبيت Python Dependencies ───────────────────────────────
install_python_deps() {
    echo ""
    echo "📦 [5/7] تثبيت Python Dependencies..."
    
    pip3 install --upgrade pip
    
    # PyTorch مع CUDA 11.8
    echo "   تثبيت PyTorch 2.2 + CUDA 11.8..."
    pip3 install torch torchvision torchaudio \
        --index-url https://download.pytorch.org/whl/cu118
    
    # PyTorch Geometric (للـ ST-GCN)
    pip3 install torch-geometric
    pip3 install pyg_lib torch_scatter torch_sparse torch_cluster torch_spline_conv \
        -f https://data.pyg.org/whl/torch-2.2.0+cu118.html
    
    # OpenMIM للـ RTMPose
    pip3 install openmim
    mim install mmengine mmcv mmdet mmpose
    
    # أدوات الرؤية
    pip3 install \
        opencv-python \
        mediapipe \
        ultralytics \
        supervision \
        open3d \
        scipy \
        numpy \
        matplotlib \
        pandas \
        pyyaml \
        GPUtil
    
    # أدوات الجودة
    pip3 install black flake8 mypy isort pytest pytest-cov
    
    echo "✅ Python Dependencies مثبتة"
}

# ─── بناء مساحة العمل ────────────────────────────────────────
build_workspace() {
    echo ""
    echo "📦 [6/7] بناء مساحة عمل ROS 2..."
    
    WS_DIR="$HOME/pose2skill_ws"
    
    if [ ! -d "$WS_DIR" ]; then
        mkdir -p "$WS_DIR/src"
        echo "✅ مجلد مساحة العمل أُنشئ في $WS_DIR"
    fi
    
    # نسخ حزم src إلى مساحة العمل
    echo "   نسخ حزم ROS 2..."
    cp -r "$(pwd)/src/"* "$WS_DIR/src/"
    
    # بناء
    cd "$WS_DIR"
    source /opt/ros/humble/setup.bash
    rosdep install --from-paths src --ignore-src -r -y 2>/dev/null || true
    colcon build --symlink-install
    
    echo "source $WS_DIR/install/setup.bash" >> ~/.bashrc
    
    echo "✅ مساحة العمل مبنية في $WS_DIR"
}

# ─── تثبيت Node.js للـ Dashboard ─────────────────────────────
install_dashboard_deps() {
    echo ""
    echo "📦 [7/7] تثبيت Web Dashboard dependencies..."
    
    if ! command -v node &>/dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    cd web_dashboard && npm install && cd ..
    
    echo "✅ Dashboard dependencies مثبتة"
}

# ─── إنشاء مجلدات البيانات ───────────────────────────────────
create_directories() {
    mkdir -p data/demonstrations
    mkdir -p data/skill_graphs
    mkdir -p experiments/logs
    mkdir -p models/st_gcn
    echo "✅ مجلدات البيانات أُنشئت"
}

# ─── الدالة الرئيسية ─────────────────────────────────────────
main() {
    check_ubuntu
    install_ros2
    install_moveit
    install_gazebo
    install_robot_descriptions
    install_python_deps
    create_directories
    build_workspace
    install_dashboard_deps
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║        ✅ الإعداد اكتمل بنجاح!                         ║"
    echo "║                                                          ║"
    echo "║  لتشغيل النظام الكامل:                                 ║"
    echo "║  source ~/.bashrc                                        ║"
    echo "║  ros2 launch pose2skill_sim full_pipeline.launch.py     ║"
    echo "║                                                          ║"
    echo "║  لتشغيل Dashboard:                                      ║"
    echo "║  cd web_dashboard && npm run dev                        ║"
    echo "╚══════════════════════════════════════════════════════════╝"
}

main "$@"
