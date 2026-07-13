package geo

// ForwardGeocoder 正向地理编码: 地址文本 → 坐标.
type ForwardGeocoder interface {
	Name() string
	Forward(query string) (lat, lon float64, err error)
}

// ReverseGeocoder 逆向地理编码: 坐标 → 精细地址.
type ReverseGeocoder interface {
	Name() string
	Reverse(lat, lon float64) (*ReverseResult, error)
}

// ReverseResult 逆向编码返回的地址.
type ReverseResult struct {
	Country  string
	Region   string
	City     string
	District string
	Locality string
	Street   string
}

// ForwardEntry 带权重的正向编码器.
type ForwardEntry struct {
	Geocoder ForwardGeocoder
	Weight   int
}

// ReverseEntry 带权重的逆向编码器.
type ReverseEntry struct {
	Geocoder ReverseGeocoder
	Weight   int
}
