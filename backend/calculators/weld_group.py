import math

class WeldGroup:
    def __init__(self):
        self.segments = []
        # Properties
        self.A_total = 0.0
        self.cx = 0.0
        self.cy = 0.0
        self.ix = 0.0
        self.iy = 0.0
        self.ixy = 0.0
        self.jz = 0.0
        self.is_valid = False

    def add_segment(self, x1, y1, x2, y2, thickness=1.0):
        length = math.sqrt((x2 - x1)**2 + (y2 - y1)**2)
        if length == 0:
            return # Ignore zero-length segments
            
        area = length * thickness
        c_x = (x1 + x2) / 2.0
        c_y = (y1 + y2) / 2.0
        
        dx = x2 - x1
        dy = y2 - y1
        theta = math.atan2(dy, dx)
        
        # Local moments of inertia
        ixx_local = (area * length**2 / 12.0) * (math.sin(theta)**2)
        iyy_local = (area * length**2 / 12.0) * (math.cos(theta)**2)
        ixy_local = (area * length**2 / 12.0) * math.sin(theta) * math.cos(theta)
        
        self.segments.append({
            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
            't': thickness, 'L': length, 'A': area,
            'cx': c_x, 'cy': c_y,
            'ixx_l': ixx_local, 'iyy_l': iyy_local, 'ixy_l': ixy_local
        })
        self._calculate_properties()

    def clear_segments(self):
        self.segments = []
        self._calculate_properties()

    def _calculate_properties(self):
        if not self.segments:
            self.is_valid = False
            return
            
        # Global Centroid
        sum_A = 0.0
        sum_Ax = 0.0
        sum_Ay = 0.0
        
        for seg in self.segments:
            sum_A += seg['A']
            sum_Ax += seg['A'] * seg['cx']
            sum_Ay += seg['A'] * seg['cy']
            
        self.A_total = sum_A
        self.cx = sum_Ax / sum_A
        self.cy = sum_Ay / sum_A
        
        # Global Moments of Inertia
        sum_ix = 0.0
        sum_iy = 0.0
        sum_ixy = 0.0
        
        for seg in self.segments:
            dy = seg['cy'] - self.cy
            dx = seg['cx'] - self.cx
            
            sum_ix += seg['ixx_l'] + seg['A'] * dy**2
            sum_iy += seg['iyy_l'] + seg['A'] * dx**2
            sum_ixy += seg['ixy_l'] + seg['A'] * dx * dy
            
        self.ix = sum_ix
        self.iy = sum_iy
        self.ixy = sum_ixy
        self.jz = self.ix + self.iy
        self.is_valid = True

    def calculate_stresses(self, fx, fy, fz, mx, my, mz, load_x, load_y):
        """
        Calculates stresses at the ends of all segments for the given loads.
        Loads fx, fy, fz, mx, my, mz applied at (load_x, load_y).
        Returns a list of segment results with stress data.
        """
        if not self.is_valid:
            raise ValueError("Weld group is invalid or has no segments.")
            
        # Transfer loads to centroid
        dx = load_x - self.cx
        dy = load_y - self.cy
        
        # Equivalent moments at centroid
        mc_x = mx + fz * dy
        mc_y = my - fz * dx
        mc_z = mz + fy * dx - fx * dy
        
        # Denominator for generalized flexure
        D = self.ix * self.iy - self.ixy**2
        # If D is very small (e.g. collinear segments), we need to handle it carefully.
        # But if D=0, it means the weld is a single line, and bending about its axis is undefined.
        
        results = []
        max_stress = 0.0
        max_stress_pt = None
        
        for idx, seg in enumerate(self.segments):
            pts = [(seg['x1'], seg['y1']), (seg['x2'], seg['y2'])]
            pt_stresses = []
            
            for (px, py) in pts:
                # Coordinates relative to centroid
                px_c = px - self.cx
                py_c = py - self.cy
                
                # Direct shear
                fd_x = fx / self.A_total
                fd_y = fy / self.A_total
                fd_z = fz / self.A_total
                
                # Torsion shear
                ft_x = -mc_z * py_c / self.jz if self.jz > 1e-9 else 0.0
                ft_y =  mc_z * px_c / self.jz if self.jz > 1e-9 else 0.0
                
                # Bending normal
                fb_z = 0.0
                if D > 1e-12:
                    fb_z = ((mc_x * self.iy + mc_y * self.ixy) / D) * py_c - \
                           ((mc_y * self.ix + mc_x * self.ixy) / D) * px_c
                
                # Total stresses
                str_x = fd_x + ft_x
                str_y = fd_y + ft_y
                str_z = fd_z + fb_z
                
                # Resultant stress vector magnitude
                str_res = math.sqrt(str_x**2 + str_y**2 + str_z**2)
                
                pt_stresses.append({
                    'x': px, 'y': py,
                    'fx': str_x, 'fy': str_y, 'fz': str_z, 'fres': str_res
                })
                
                if str_res > max_stress:
                    max_stress = str_res
                    max_stress_pt = {'x': px, 'y': py, 'fres': str_res, 'fx': str_x, 'fy': str_y, 'fz': str_z}
            
            # Midpoint stress just for rendering or extra data
            pmx = (seg['x1'] + seg['x2']) / 2
            pmy = (seg['y1'] + seg['y2']) / 2
            pm_c_x = pmx - self.cx
            pm_c_y = pmy - self.cy
            ft_x = -mc_z * pm_c_y / self.jz if self.jz > 1e-9 else 0.0
            ft_y =  mc_z * pm_c_x / self.jz if self.jz > 1e-9 else 0.0
            fb_z = 0.0
            if D > 1e-12:
                fb_z = ((mc_x * self.iy + mc_y * self.ixy) / D) * pm_c_y - \
                       ((mc_y * self.ix + mc_x * self.ixy) / D) * pm_c_x
            str_x = (fx / self.A_total) + ft_x
            str_y = (fy / self.A_total) + ft_y
            str_z = (fz / self.A_total) + fb_z
            str_res = math.sqrt(str_x**2 + str_y**2 + str_z**2)
            
            results.append({
                'id': idx,
                'p1': pt_stresses[0],
                'p2': pt_stresses[1],
                'mid': {'x': pmx, 'y': pmy, 'fres': str_res}
            })
            
        return {
            'properties': {
                'area': self.A_total,
                'cx': self.cx,
                'cy': self.cy,
                'ix': self.ix,
                'iy': self.iy,
                'ixy': self.ixy,
                'jz': self.jz
            },
            'loads_at_centroid': {
                'fx': fx, 'fy': fy, 'fz': fz,
                'mc_x': mc_x, 'mc_y': mc_y, 'mc_z': mc_z
            },
            'segments': results,
            'max_stress': max_stress,
            'max_stress_pt': max_stress_pt
        }

def calculate_weld_group(inputs):
    """
    Entry point for eel.
    inputs:
        segments: [{x1, y1, x2, y2, t}, ...]
        loads: {fx, fy, fz, mx, my, mz, load_x, load_y}
    """
    try:
        wg = WeldGroup()
        for s in inputs.get('segments', []):
            wg.add_segment(float(s['x1']), float(s['y1']), float(s['x2']), float(s['y2']), float(s.get('t', 1.0)))
            
        loads = inputs.get('loads', {})
        res = wg.calculate_stresses(
            fx=float(loads.get('fx', 0)),
            fy=float(loads.get('fy', 0)),
            fz=float(loads.get('fz', 0)),
            mx=float(loads.get('mx', 0)),
            my=float(loads.get('my', 0)),
            mz=float(loads.get('mz', 0)),
            load_x=float(loads.get('load_x', 0)),
            load_y=float(loads.get('load_y', 0))
        )
        return {"status": "success", "data": res}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}
