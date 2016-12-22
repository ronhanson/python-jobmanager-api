FROM ubuntu:trusty

MAINTAINER Ronan Delacroix <ronan.delacroix@gmail.com>

ENV DEBIAN_FRONTEND noninteractive

RUN apt-get -y update \
    && apt-get -y install build-essential python3.4 python3-all python3-requests python3-six python3-setuptools \
                          python3-pip python-pip python-oauthlib python-crypto python-greenlet python-all \
                          python-all-dev debhelper python-setuptools python-stdeb apt-file libconfig-file-perl \
                          libapt-pkg-perl liblist-moreutils-perl libregexp-assemble-perl git

RUN pip3 install stdeb

COPY build_deb.sh /home/docker/script/build_deb.sh
RUN chmod 744 /home/docker/script/build_deb.sh

RUN mkdir /opt/current_folder
VOLUME /opt/current_folder
WORKDIR /opt/current_folder

ENTRYPOINT /home/docker/script/build_deb.sh

