#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DATE=$(date +%Y-%m-%d:%H:%M:%S)
totalm=$(free -m | awk '/^Mem:/{print $2}')

if [[ "$DIR" = '/root'* ]]; then
    echo "You cannot install Countly under /root. Suggested paths: /opt or /usr."
    exit 1
elif [[ "$DIR" = '/home'* ]]; then
    if ! [[ "$DIR" = '/home/countly'* ]]; then
        echo "You cannot install Countly under home directory of any other user. Suggested paths: /opt or /usr."
        exit 1
    fi
fi

if [ "$INSIDE_DOCKER" == "1" ]; then
    if [ -f /etc/lsb-release ]; then
        apt install sudo -y
    elif [ -f /etc/redhat-release ]; then
        yum install sudo -y
    fi
fi

sudo bash "$DIR/scripts/init_countly_user.sh"

if [ "$totalm" -lt "1800" ]; then
    echo "Countly requires at least 2Gb of RAM"
    if [ "$COUNTLY_OVERWRITE_MEM_REQUIREMENT" != "1" ]; then
        exit 1
    else
        echo "COUNTLY_OVERWRITE_MEM_REQUIREMENT set, running make.swap.sh"
        sudo bash "$DIR/scripts/make.swap.sh" 2>&1 | sudo -u countly tee "$DIR/../log/countly-install-$DATE.log"
    fi
fi

if [ -f "$DIR/offline_installer.sh" ]; then
    sudo su countly -c "/bin/bash $DIR/offline_installer.sh" 2>&1 | sudo -u countly tee "$DIR/../log/countly-install-$DATE.log"
elif [ -f /etc/lsb-release ]; then
    sudo su countly -c "INSIDE_DOCKER=$INSIDE_DOCKER /bin/bash $DIR/countly.install_ubuntu.sh" 2>&1 | sudo -u countly tee "$DIR/../log/countly-install-$DATE.log"
elif [ -f /etc/redhat-release ]; then
    sudo su countly -c "INSIDE_DOCKER=$INSIDE_DOCKER /bin/bash $DIR/countly.install_rhel.sh" 2>&1 | sudo -u countly tee "$DIR/../log/countly-install-$DATE.log"
fi
