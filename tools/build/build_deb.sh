#!/bin/bash

[ -d "./dist" ]
dist_folder_exists_before=$?

if [ ! -f "./setup.py" ]
then
    >&2 echo ""
    >&2 echo "No setup.py file found in current folder."
    exit 1
fi

if [ ! -f "./debian.cfg" ]
then
    >&2 echo ""
    >&2 echo "No debian.cfg file found in current folder."
    exit 2
fi

#ignoring requirements.txt file for debian package creation
mv requirements.txt _requirements.txt
touch requirements.txt

if [ -f "./debian/pre_build_deb.sh" ]
then
    echo ""
    echo "Found pre build script - executing ./debian/pre_build_deb.sh"
    echo ""
    source "./debian/pre_build_deb.sh"
    echo "Done."
fi

echo ""
echo "Packaging .DEB now..."
echo ""
python3 setup.py --command-packages=stdeb.command sdist_dsc -i --with-python2=True --with-python3=True --dist-dir=deb_dist --extra-cfg-file=debian.cfg --ignore-install-requires 

if [ -d "./debian" ]
then
    echo ""
    echo " ./debian folder found. Copying debian post/pre install script..."
    echo ""
    cp -Rv debian/* deb_dist/*/debian/
    chmod +x deb_dist/*/debian/*postinst
    chmod +x deb_dist/*/debian/*postrm
    chmod +x deb_dist/*/debian/*prerm
    [ -f "deb_dist/*/debian/pre_build_deb.sh" ] && rm "deb_dist/*/debian/pre_build_deb.sh"
    [ -f "deb_dist/*/debian/post_build_deb.sh" ] && rm "deb_dist/*/debian/post_build_deb.sh"
else
    echo ""
    echo "No ./debian/ folder found."
    echo ""
fi

echo ""
echo "Rebuilding package with postinst script..."
echo ""
cd deb_dist/*/
dpkg-buildpackage -rfakeroot -uc -us -b
cd ../..

echo ""
echo ".DEB creation completed"
echo ""
[ -d build ] || mkdir build
mv `ls deb_dist/*.deb` ./build/
echo "   .deb moved into './build' folder : "
ls build/*.deb
echo ""

#setting back up requirements.txt file
cp _requirements.txt requirements.txt
rm _requirements.txt


if [ -f "./debian/post_build_deb.sh" ]
then
    echo ""
    echo "Found post build script - executing ./debian/post_build_deb.sh"
    echo ""
    source "./debian/post_build_deb.sh"
    echo "Done."
fi

#cleaning
echo "Cleaning..."
if [ $dist_folder_exists_before == 0 ]
then
    echo "Removing ./deb_dist and ./*.egg-info folders."
    rm -Rf deb_dist *.egg-info
else
    echo "Removing ./dist, ./deb_dist and ./*.egg-info folders."
    rm -Rf dist deb_dist *.egg-info
fi

echo "Done."
