Pod::Spec.new do |s|
  s.name           = 'KeepAlive'
  s.version        = '1.0.0'
  s.summary        = 'Plays silence, so iOS does not suspend a phone that is waiting'
  s.description    = 'A local Expo module looping an in-memory silent buffer, which is what gives UIBackgroundModes audio something to be true about while a channel is empty.'
  s.author         = ''
  s.homepage       = 'https://thefloor.rvanegas.co'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
