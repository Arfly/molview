/**
 * This file is part of MolView (http://molview.org)
 * Copyright (c) 2014, 2015 Herman Bergwerf
 *
 * MolView is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * MolView is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with MolView.  If not, see <http://www.gnu.org/licenses/>.
 */

function MPMolecule(mp)
{
	this.atoms = [];
	this.bonds = [];

	this.stack = [];
	this.reverseStack = [];
	this.copy = { atoms: [], bonds: [], fingerprint: "" };

    this.mp = mp;
}

/**
 * Clear all bonds and atoms
 */
MPMolecule.prototype.clear = function()
{
    this.atoms = [];
    this.bonds = [];
}

/**
 * Execute callback for all bonds and or atoms
 * @param {Function} callback
 * @param {Boolean}  atoms
 * @param {Boolean}  bonds
 */
MPMolecule.prototype.exec = function(callback, atoms, bonds)
{
    if(atoms)
    {
        for(var i = 0; i < this.atoms.length; i++)
        {
            if(callback.call(this.mp, this.atoms[i])) return;
        }
    }
    if(bonds)
    {
        for(var i = 0; i < this.bonds.length; i++)
        {
            if(callback.call(this.mp, this.bonds[i])) return;
        }
    }
}

/**
 * Load molfile into MPMolecule
 * Uses Ketcher chem utils
 * @param {String}  mol
 */
MPMolecule.prototype.loadMOL = function(mol)
{
	this.clear();

	var molecule = chem.Molfile.parseCTFile(mol.split("\n"));

	//convert Ketcher data format into MolPad molecule
	var scope = this;
	molecule.atoms.each(function(i, atomData)
	{
		var atom = new MPAtom(scope.mp, {
			i: i,
			x: atomData.pp.x * scope.mp.s.bond.length,
			y: atomData.pp.y * scope.mp.s.bond.length,
			element: atomData.label,
			charge: atomData.charge,
			isotope: atomData.isotope
		});

		scope.atoms.push(atom);
	});

	molecule.bonds.each(function(i, bondData)
	{
		scope.atoms[bondData.begin].addBond(scope.bonds.length);
		scope.atoms[bondData.end].addBond(scope.bonds.length);

		var bond = new MPBond(scope.mp, {
			i: i,
			type: bondData.type,
			stereo: bondData.stereo,
			from: bondData.begin,
			to: bondData.end
		});

		scope.bonds.push(bond);
	});
}

/**
 * @return {String} Molfile string
 */
MPMolecule.prototype.getMOL = function()
{
	return new chem.MolfileSaver().saveMolecule(this.getKetcherData());
}

/**
 * @return {String} SMILES string
 */
MPMolecule.prototype.getSMILES = function()
{
	if(this.atoms.length == 0) throw new Error("No atoms found");
	return new chem.SmilesSaver().saveMolecule(this.getKetcherData());
}

/**
 * Convert molecule into chem.Struct object
 * @return {chem.Struct}
 */
MPMolecule.prototype.getKetcherData = function()
{
	var molecule = new chem.Struct();

	for(var i = 0; i < this.atoms.length; i++)
	{
		molecule.atoms.add(this.atoms[i].getKetcherData());
	}
	for(var i = 0; i < this.bonds.length; i++)
	{
		molecule.bonds.add(this.bonds[i].getKetcherData());
	}

	molecule.initHalfBonds();
	molecule.initNeighbors();
	molecule.markFragments();

	return molecule;
}

/**
 * Convert molecule into plain JSON object
 * @return {Object}
 */
MPMolecule.prototype.getPlainData = function()
{
	var molecule = { atoms: [], bonds: [] };

	for(var i = 0; i < this.atoms.length; i++)
	{
		molecule.atoms.push(this.atoms[i].getConfig());
	}
	for(var i = 0; i < this.bonds.length; i++)
	{
		molecule.bonds.push(this.bonds[i].getConfig());
	}

	return molecule;
}

/**
 * Load plain JSON object
 * @param {Object} data
 */
MPMolecule.prototype.loadPlainData = function(data)
{
	this.clear();

	for(var i = 0; i < data.atoms.length; i++)
	{
		this.atoms.push(new MPAtom(this.mp, data.atoms[i]));
	}
	for(var i = 0; i < data.bonds.length; i++)
	{
		this.bonds.push(new MPBond(this.mp, data.bonds[i]));
	}

	this.mp.redraw(true);
}

/**
 * Generate unique fingerprint for the current molecule
 * @return {String}
 */
MPMolecule.prototype.getFingerprint = function()
{
	var array = [];
	for(var i = 0; i < this.atoms.length; i++)
	{
		array.push(this.atoms[i].toString())
	}

	array.sort();
	return array.join("");
}

/**
 * Check if the current molecule has changed based on its fingerprint
 */
MPMolecule.prototype.isChanged = function()
{
	return this.getFingerprint() != this.copy.fingerprint;
}

/**
 * Create fragment from fragment data which is created using MPFragment
 * @param  {Object}  fragment Fragment data
 * @param  {Boolean} select   Select all new bonds and atoms [optional]
 * @return {Object}           New fragment data
 */
MPMolecule.prototype.createFragment = function(fragment, select)
{
	var ret = { atoms: [], bonds: [] };

	for(var i = 0; i < fragment.atoms.length; i++)
	{
		var atom = new MPAtom(this.mp, {
			i: this.atoms.length,
			x: fragment.atoms[i].center.x,
			y: fragment.atoms[i].center.y,
			element: fragment.atoms[i].element,
			selected: select
		});

		this.atoms.push(atom);
		ret.atoms.push(atom.index);
	}

	for(var i = 0; i < fragment.bonds.length; i++)
	{
		var bond = new MPBond(this.mp, {
			i: this.bonds.length,
			type: fragment.bonds[i].type,
			stereo: MP_STEREO_NONE,
			from: ret.atoms[fragment.bonds[i].from],
			to: ret.atoms[fragment.bonds[i].to],
			selected: select
		});

		this.atoms[bond.from].addBond(bond.index);
		this.atoms[bond.to].addBond(bond.index);
		this.bonds.push(bond);
		ret.bonds.push(bond.index);
	}

	if(select)
	{
		this.mp.sel.update();
	}

	return ret;
}

/**
 * Rotate array of atoms around a center using the angle between the center
 * and a given point and an optional number of clampSteps
 *
 * @param  {MPPoint} center
 * @param  {MPPoint} point
 * @param  {Array}   atoms        Array of atom indices
 * @param  {Float}   currentAngle Current rotation angle of the selction
 * @param  {Float}   startAngle   Start rotation angle used for angle clamping
 * @param  {Integer} clampSteps   Number of steps the angle should be clamped to
 * @param  {Boolean} forced       Forced update
 * @return {Float}                New currentAngle
 */
MPMolecule.prototype.rotateAtoms = function(center, point, atoms, currentAngle, startAngle, clampSteps, forced)
{
	var a = currentAngle;
	if(clampSteps !== undefined) a = clampedAngle(startAngle, center, point, clampSteps);
	else a = center.angleTo(point);

	if(a != currentAngle || forced)
	{
		for(var i = 0; i < atoms.length; i++)
		{
			this.atoms[atoms[i]].rotateAroundCenter(center, a - currentAngle);
		}
		return a;
	}
	else return currentAngle;
}

/**
 * Merge atom src into atom dest
 * @param   {Integer} src     Index of srd atom
 * @param   {Integer} dest    Index of dest atom
 * @param   {Boolean} reverse Reverse src and dest but retain old dest atom
 * @return  {Array}           New index mapping
 */
MPMolecule.prototype.mergeAtoms = function(src, dest, reverse)
{
	var _src = this.atoms[src];
	var _dest = this.atoms[dest];

	if(reverse) _dest.center.replace(_src.center);
	_dest.select(_src.isSelected() || _dest.isSelected());

	for(var j = 0; j < _src.bonds.length; j++)//transfer bonds
	{
		/* only transfer bond if bond destination is not
		already included in the current set of bonds */
		var n = _dest.getNeighborBond(this.bonds[_src.bonds[j]]
				.getOppositeAtom(src));
		if(n == -1)
		{
			this.bonds[_src.bonds[j]].replaceAtom(src, dest);
			_dest.addBond(_src.bonds[j]);
		}
		else
		{
			//transfer selected state to replacement bond
			this.bonds[n].select(this.bonds[_src.bonds[j]].isSelected()
					|| this.bonds[n].isSelected())

			//always force single bond over any other bond types
			if(this.bonds[_src.bonds[j]].type == MP_BOND_SINGLE)
			{
				this.bonds[n].setType(MP_BOND_SINGLE);
			}
		}
	}

	//carbon atoms are less important
	if(_dest.element == "C")
	{
		_dest.setElement(_src.element);
	}

	this.atoms.splice(src, 1);//remove old atom
	return this.updateIndices();
}

/**
 * Collapse set of atom indices into the entire molecule
 * @param {Array}   atoms        Atom indices
 * @param {Boolean} reverse      If set, the $atoms centers will not be used
 */
MPMolecule.prototype.collapseAtoms = function(atoms, reverse)
{
	for(var i = 0; i < atoms.length; i++)
	{
		for(var j = 0; j < this.atoms.length; j++)
		{
			if(atoms.indexOf(j) != -1) continue;//skip input atoms

			var distance = (!this.atoms[atoms[i]].isVisible()
						 && !this.atoms[j].isVisible() ? 1 : 2)
							* this.mp.s.atom.radiusScaled;

			if(this.atoms[atoms[i]].center.inCircle(
					this.atoms[j].center, distance))
			{
				var map = this.mergeAtoms(j, atoms[i], reverse);
				atoms = mapArray(atoms, map.amap);
				break;//the old atoms[i] has been handled
			}
		}
	}
}

/**
 * Count how much atoms of the input can be collapsed into the molecules
 * @param  {Array} atoms Atom indices
 * @return {Integer}
 */
MPMolecule.prototype.countCollapses = function(atoms)
{
	var ret = 0;
	for(var i = 0; i < atoms.length; i++)
	{
		for(var j = 0; j < this.atoms.length; j++)
		{
			if(atoms.indexOf(j) != -1) continue;//skip input atoms

			if(this.atoms[atoms[i]].center.inCircle(
					this.atoms[j].center, this.mp.s.atom.radiusScaled))
			{
				ret++;
			}
		}
	}
	return ret;
}

/**
 * Remove an atom with the given index from the current molecule
 * @param  {Integer} index Atom index
 * @return {Object}        New indices maps
 */
MPMolecule.prototype.removeAtom = function(index)
{
	this.atoms.splice(index, 1);
	this.mp.invalidate();
	return this.updateIndices();
}

/**
 * Remove a bond with the given index from the current molecule
 * @param {Integer} index Bond index
 */
MPMolecule.prototype.removeBond = function(index)
{
	var f = this.bonds[index].from;
	var t = this.bonds[index].to;

	//remove connected atoms if this is the last bond
	if(this.atoms[f].bonds.length == 1)
	{
		this.atoms.splice(f, 1);
		if(t > f) t--;
	}
	if(this.atoms[t].bonds.length == 1)
	{
		this.atoms.splice(t, 1);
	}

	this.bonds.splice(index, 1);
	this.updateIndices();
}

/**
 * @return {Array} New index mapping
 */
MPMolecule.prototype.updateIndices = function()
{
	/* CAUTION: nobody is allowed to execute any methods during this process.
	Therefore, only manual data modifications should be used */

	var atomIndexMap = {}, bondIndexMap = {};
	for(var i = 0; i < this.atoms.length; i++)
	{
		atomIndexMap[this.atoms[i].index] = i;
		this.atoms[i].index = i;
		this.atoms[i].valid = false;
	}
	for(var i = 0; i < this.bonds.length; i++)
	{
		var bond = this.bonds[i];
		var from = atomIndexMap[bond.from];
		var to = atomIndexMap[bond.to];

		if(from !== undefined && to !== undefined)
		{
			bondIndexMap[bond.index] = i;
			bond.index = i;
			bond.from = from;
			bond.to = to;
			bond.valid = false;//manual invalidate
		}
		else
		{
			this.bonds.splice(i, 1);
			i--;
		}
	}
	for(var i = 0; i < this.atoms.length; i++)
	{
		this.atoms[i].mapBonds(bondIndexMap);
	}

	this.mp.sel.update();

	return {
		amap: atomIndexMap,
		bmap: bondIndexMap
	};
}

MPMolecule.prototype.getBBox = function()
{
	if(this.atoms.length == 0)
	{
		return {
			x: 0,
			y: 0,
			width: 1,
			height: 1
		}
	}

	var bottomLeft = undefined, topRight = undefined;

	for(var i = 0; i < this.atoms.length; i++)
	{
		//calculate center line since molecule might not be updated yet
		var l = this.atoms[i].calculateCenterLine();
		var px1 = l.area.left !== undefined ? l.area.left.x : l.area.point.x;
		var px2 = l.area.right !== undefined ? l.area.right.x : l.area.point.x;
		var py = l.area.left !== undefined ? l.area.left.y : l.area.point.y;

		if(bottomLeft == undefined)
		{
			bottomLeft = { x: px1, y: py };
		}
		else
		{
			if(bottomLeft.x > px1) bottomLeft.x = px1;
			if(bottomLeft.y > py) bottomLeft.y = py;
		}

		if(topRight == undefined)
		{
			topRight = { x: px2, y: py };
		}
		else
		{
			if(topRight.x < px2) topRight.x = px2;
			if(topRight.y < py) topRight.y = py;
		}
	}

	var r = this.mp.s.atom.radius;
	return {
		x: bottomLeft.x - r,
		y: bottomLeft.y - r,
		width: topRight.x - bottomLeft.x + 2 * r,
		height: topRight.y - bottomLeft.y + 2 * r
	};
}

/**
 * Undo/redo
 */

/**
 * Updates the internal molecule plain copy for the undo stack
 */
MPMolecule.prototype.updateCopy = function()
{
    var fingerprint = this.getFingerprint();

    if(fingerprint != this.copy.fingerprint)
    {
        this.reverseStack = [];
        this.stack.push(this.copy);
        if(this.stack.length > this.mp.s.maxStackSize)
        {
            this.stack.shift();
        }

        this.copy = this.getPlainData();
        this.copy.fingerprint = fingerprint;
        this.mp.changed();
    }
}

MPMolecule.prototype.undo = function(noRedoPush)
{
	if(this.stack.length > 0)
	{
		if(!noRedoPush)
		{
			this.reverseStack.push(this.copy);
		}

		this.copy = this.stack.pop();
		this.loadPlainData(this.copy);

        return true;
	}
    else return false;
}

MPMolecule.prototype.redo = function()
{
	if(this.reverseStack.length > 0)
	{
		this.stack.push(this.copy);
		this.copy = this.reverseStack.pop();
		this.loadPlainData(this.copy);
        return true;
	}
    else return false;
}

/* DEPRECATED */

MPMolecule.prototype.removeImplicitHydrogen = function()
{
	var implicit = [];

	for(var i = 0; i < this.atoms.length; i++)
	{
		if(this.atoms[i].isImplicit())
		{
			implicit.push(i);
		}
	}

	for(var i = 0; i < implicit.length; i++)
	{
		this.atoms.splice(implicit[i] - i, 1);
	}

	this.updateIndices();
}

MPMolecule.prototype.addImplicitHydrogen = function()
{
	for(var i = 0; i < this.atoms.length; i++)
	{
		this.atoms[i].addImplicitHydrogen();
	}
}
